import { z } from 'zod';
import type {
  ContentHookContext,
  DocumentData,
  FieldDefinition,
  MaybePromise,
  VersionedFunction,
} from '../definition.ts';
import type { QueryPresetQuery } from './preset-contracts.ts';

export const presetActions = ['read', 'update', 'delete'] as const;
export type PresetAction = (typeof presetActions)[number];
export const presetAccessRuleSchema = z.strictObject({
  constraint: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
  users: z.array(z.uuid().transform((id) => id.toLowerCase())).optional(),
  data: z.record(z.string(), z.json()).optional(),
  initialSnapshot: z.string().optional(),
});
export const presetAccessSchema = z.strictObject({
  read: presetAccessRuleSchema,
  update: presetAccessRuleSchema,
  delete: presetAccessRuleSchema,
});
export type PresetAccess = z.infer<typeof presetAccessSchema>;
export type PresetAccessRule = z.infer<typeof presetAccessRuleSchema>;
export interface PresetSnapshot {
  id?: string;
  ownerId: string;
  name: string;
  query: QueryPresetQuery;
  access: PresetAccess;
}
export interface PresetConstraintContext extends ContentHookContext {
  action: PresetAction;
  preset: PresetSnapshot;
  data: DocumentData;
}
export interface PresetConstraint {
  value: string;
  label: string;
  fields?: readonly FieldDefinition[];
  access: VersionedFunction<(context: PresetConstraintContext) => MaybePromise<boolean>>;
}
export type PresetConstraints = Partial<
  Readonly<Record<PresetAction, readonly PresetConstraint[]>>
>;
