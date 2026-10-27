import { z } from 'zod';
import { collection, ok } from './page-fixture';
import type { PageRequest } from './page-fixture';
import { presetAccessSchema } from '../../../contracts/query-presets';
import type { PresetEditor } from '../../../contracts/query-presets';
import type { EditorNode } from '../../../contracts/editor';
export const builtinConstraints = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'onlyMe', label: 'Only me' },
  { value: 'specificUsers', label: 'Specific users' },
];
const options = [
  ...builtinConstraints.map((option) => ({ ...option, dataSchema: {} })),
  { value: 'team', label: 'Team rule', dataSchema: {} },
];
export const presetCollection = {
  ...collection,
  queryPresetConstraints: { read: options, update: options, delete: options },
};
export function parameter(name: string, extra: Partial<EditorNode> = {}): EditorNode {
  return {
    id: name,
    name,
    label: name,
    type: 'text',
    required: false,
    localized: false,
    write: 'allowed',
    constraints: {},
    ...extra,
  };
}
export const previewInput = z.object({
  action: z.enum(['read', 'update', 'delete']),
  access: presetAccessSchema,
  locale: z.string(),
  name: z.string(),
});
export function presetPreview(input: PageRequest, overrides: Partial<PresetEditor> = {}) {
  const body = previewInput.parse(input.body);
  const rule = body.access[body.action];
  const custom = rule.constraint === 'team';
  return ok({
    behaviorHash: 'behavior',
    visibility: {},
    layout: custom ? [parameter('Note'), parameter('Metadata', { type: 'json' })] : [],
    data: custom ? { Note: 'Default', Metadata: { ok: true }, ...rule.data } : {},
    initialSnapshot: custom ? (rule.initialSnapshot ?? 'signed-defaults') : null,
    richTextNodes: [],
    componentVersions: {},
    constraints: [...builtinConstraints, { value: 'team', label: 'Team rule' }],
    ...overrides,
  });
}
