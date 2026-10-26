import { readFileSync } from 'node:fs';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { z } from 'zod';
import type { PublicObject } from '@new-cms/cms/content/delivery';

const ruleSchema = z.object({
  key: z.string(),
  source: z.string(),
  parameters: z.record(
    z.string(),
    z.array(z.enum(['argument', 'number', 'date', 'time', 'select', 'plural', 'selectordinal'])),
  ),
  richTags: z.array(z.string()),
});
const contract = z
  .object({
    contractVersion: z.string(),
    sourceLocale: z.string(),
    requiredNamespaces: z.array(z.string()),
    namespaces: z.array(z.object({ namespace: z.string(), messages: z.array(ruleSchema) })),
  })
  .parse(
    JSON.parse(
      readFileSync(new URL('./resources/ui-message-contract.v5.json', import.meta.url), 'utf8'),
    ),
  );
const seeds = z
  .object({
    contractVersion: z.literal(contract.contractVersion),
    locales: z.record(z.string(), z.record(z.string(), z.json())),
  })
  .parse(
    JSON.parse(
      readFileSync(new URL('./resources/ui-message-seeds.v5.json', import.meta.url), 'utf8'),
    ),
  );
const namespaces = new Map(
  contract.namespaces.map((namespace) => [namespace.namespace, namespace.messages]),
);

function sameKeys(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}

function flatten(value: unknown, limit: number): Map<string, string> {
  const result = new Map<string, string>();
  function visit(child: unknown, prefix: string, depth: number): void {
    if (typeof child === 'string') {
      if (!child.trim() || child.length > 16000 || result.size >= limit)
        throw new Error('Invalid message text');
      result.set(prefix, child);
      return;
    }
    if (
      child === null ||
      typeof child !== 'object' ||
      Array.isArray(child) ||
      depth > 16 ||
      Object.keys(child).length === 0
    )
      throw new Error('Invalid message structure');
    for (const [key, item] of Object.entries(child)) {
      if (!/^[A-Za-z0-9_-]+$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Invalid message key');
      visit(item, prefix ? `${prefix}.${key}` : key, depth + 1);
    }
  }
  visit(value, '', 0);
  return result;
}

function validateMessage(message: string, rule: z.output<typeof ruleSchema>): void {
  const parameters = new Set<string>();
  const tags = new Set<string>();
  let nodes = 0;
  function visit(elements: MessageFormatElement[], depth: number): void {
    if (depth > 16) throw new Error('Message depth exceeded');
    for (const element of elements) {
      if (++nodes > 8000) throw new Error('Message nodes exceeded');
      if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
      if (element.type === TYPE.tag) {
        if (!rule.richTags.includes(element.value)) throw new Error('Unexpected message tag');
        tags.add(element.value);
        visit(element.children, depth + 1);
        continue;
      }
      const kind =
        element.type === TYPE.plural && element.pluralType === 'ordinal'
          ? 'selectordinal'
          : TYPE[element.type];
      if (!allowedParameter(rule, element.value, kind))
        throw new Error('Unexpected message parameter');
      parameters.add(element.value);
      if (element.type === TYPE.plural || element.type === TYPE.select)
        for (const option of Object.values(element.options)) visit(option.value, depth + 1);
    }
  }
  visit(parse(message, { requiresOtherClause: true }), 0);
  if (
    !sameKeys([...parameters], Object.keys(rule.parameters)) ||
    !sameKeys([...tags], rule.richTags)
  )
    throw new Error('Message arguments differ');
}

export function validateMessageNamespace(namespace: string, messages: unknown): boolean {
  try {
    const rules = namespaces.get(namespace);
    if (!rules) return false;
    const values = flatten(messages, rules.length);
    if (
      !sameKeys(
        [...values.keys()],
        rules.map((rule) => rule.key),
      )
    )
      return false;
    for (const rule of rules) validateMessage(values.get(rule.key) ?? '', rule);
    return true;
  } catch {
    return false;
  }
}

export const interfaceMessageContract = {
  version: contract.contractVersion,
  availableUntil: null,
  validate(messages: PublicObject): boolean {
    return (
      sameKeys(Object.keys(messages), contract.requiredNamespaces) &&
      Object.entries(messages).every(([namespace, value]) =>
        validateMessageNamespace(namespace, value),
      )
    );
  },
};
export const interfaceMessageSeeds: Record<string, PublicObject> = seeds.locales;
if (
  Object.values(interfaceMessageSeeds).some(
    (messages) => !interfaceMessageContract.validate(messages),
  )
)
  throw new Error('Software message seeds differ from their contract');

function allowedParameter(rule: z.output<typeof ruleSchema>, name: string, kind: string): boolean {
  return (
    Object.hasOwn(rule.parameters, name) &&
    (rule.parameters[name]?.some((allowed) => allowed === kind) ?? false)
  );
}
