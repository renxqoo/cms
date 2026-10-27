import { invokeFunction, immutable } from './invoke-function.ts';
import { candidateSibling } from './sibling-data.ts';
import { ruleResult } from './rule-result.ts';
import type { FunctionScope } from './invoke-function.ts';
import type {
  CollectionDefinition,
  ContentLimits,
  DocumentData,
  FieldDefinition,
  FieldPolicy,
  FieldPolicyContext,
} from '../definition.ts';

export interface PolicyScope {
  limits: ContentLimits;
  functions: FunctionScope;
}
export interface PolicyInput extends PolicyScope {
  collection: CollectionDefinition;
  data: DocumentData;
  context: FieldPolicyContext;
  select?: readonly string[];
  policyData?: DocumentData;
}
export interface PolicyTraversal extends PolicyScope {
  context: FieldPolicyContext;
  path: string;
}

export function nestedPolicy(input: PolicyTraversal, path: string): PolicyTraversal {
  return { ...input, path: input.path ? `${input.path}.${path}` : path };
}

export function rowPolicy(input: PolicyTraversal, value: DocumentData, index: number) {
  return nestedPolicy(input, typeof value['id'] === 'string' ? value['id'] : String(index));
}

export async function evaluateFieldPolicy(
  policy: FieldPolicy | undefined,
  input: PolicyTraversal,
): Promise<boolean> {
  if (!policy) return true;
  const { signal: _signal, ...context } = input.context;
  const related = context.data ? candidateSibling(context.data, input.path) : undefined;
  const frozen = immutable({
    ...context,
    ...(input.path ? { path: input.path } : {}),
    ...(related ? { siblingData: related.siblingData } : {}),
    ...(related?.blockData ? { blockData: related.blockData } : {}),
  });
  const result = await invokeFunction({
    limits: input.limits,
    scope: input.functions,
    run: (signal) => policy.run(Object.freeze({ ...frozen, signal })),
  });
  return ruleResult(result);
}

export function childDefinitions(field: FieldDefinition, value: DocumentData) {
  return field.type === 'blocks'
    ? (field.blocks?.find((block) => block.key === value['blockType'])?.fields ?? [])
    : (field.fields ?? []);
}
