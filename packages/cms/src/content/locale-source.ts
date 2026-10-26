import { z } from 'zod';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLocaleSource, ContentLimits } from './definition.ts';
import type { ContentMapping, CompiledCollection } from './model.ts';
import type { ContentOptions } from './types.ts';

const locale = z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/);
export function validContentLocaleCode(value: string): boolean {
  return locale.safeParse(value).success;
}
const sourceSchema = z.strictObject({
  default: locale,
  supported: z.array(locale).min(1),
  fallback: z.record(z.string(), z.array(locale)),
  enabled: z.array(locale).min(1),
});

function sourceLocales(raw: ContentLocaleSource, maxLocales: number): ContentLocaleSource {
  const parsed = sourceSchema.safeParse(raw);
  if (!parsed.success) fail('invalid_input');
  const value = parsed.data;
  if (
    value.supported.length > maxLocales ||
    new Set(value.supported).size !== value.supported.length ||
    new Set(value.enabled).size !== value.enabled.length ||
    !value.enabled.includes(value.default) ||
    value.enabled.some((item) => !value.supported.includes(item)) ||
    Object.entries(value.fallback).some(
      ([key, targets]) =>
        !value.supported.includes(key) ||
        new Set(targets).size !== targets.length ||
        targets.includes(key) ||
        targets.some((target) => !value.supported.includes(target)),
    )
  )
    fail('invalid_input');
  return structuredClone(value);
}

export function createLocaleMapping(
  options: Pick<ContentOptions, 'mapping' | 'resolveLocaleSource'> & {
    limits: Pick<ContentLimits, 'maxLocales'>;
  },
) {
  const transactions = new WeakMap<SqlExecutor, Promise<ContentMapping>>();
  async function resolve(tx: SqlExecutor): Promise<ContentMapping> {
    const sources = new Map<string, ContentLocaleSource>();
    const collections: CompiledCollection[] = [];
    for (const collection of options.mapping.collections) {
      const source = collection.definition.localeSource;
      if (!source) {
        collections.push(collection);
        continue;
      }
      let locales = sources.get(source);
      if (!locales) {
        if (!options.resolveLocaleSource) fail('invalid_input');
        locales = sourceLocales(
          await options.resolveLocaleSource(source, tx),
          options.limits.maxLocales,
        );
        sources.set(source, locales);
      }
      collections.push({ ...collection, definition: { ...collection.definition, locales } });
    }
    return {
      ...options.mapping,
      collections,
      get(key, schemaVersion) {
        const original = options.mapping.get(key, schemaVersion);
        const collection = collections.find(
          (candidate) =>
            candidate.definition.id === original.definition.id &&
            candidate.definition.schemaVersion === original.definition.schemaVersion,
        );
        if (!collection) fail('invalid_input');
        return collection;
      },
    };
  }
  return function mappingFor(tx: SqlExecutor): Promise<ContentMapping> {
    let mapping = transactions.get(tx);
    if (!mapping) {
      mapping = resolve(tx);
      transactions.set(tx, mapping);
    }
    return mapping;
  };
}
