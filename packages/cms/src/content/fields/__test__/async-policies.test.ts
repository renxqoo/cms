import { expect, it } from 'vitest';
import { contentDefinitions, contentLimits } from '../../../../../../test/support/content.ts';
import { projectData } from '../policy-read.ts';
import { assertValidationData } from '../policy-write.ts';
import type { FieldDefinition, FieldPolicyContext } from '../../definition.ts';
import type { Principal } from '@new-cms/cms/access';

const actor: Principal = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'actor@example.test',
  displayName: null,
  roleId: '10000000-0000-4000-8000-000000000002',
  roleCode: 'editor',
  status: 'active',
  activation: 'activated',
  version: 1,
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
  lastLoginAt: null,
  role: {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'editor',
    name: 'Editor',
    description: null,
    status: 'active',
    isSuper: false,
    version: 1,
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
  },
};
const context: FieldPolicyContext = {
  actor,
  operation: 'documents.validate',
  collectionKey: 'articles',
  locale: 'en',
  documentId: '20000000-0000-4000-8000-000000000001',
};
function collection(fields: readonly FieldDefinition[]) {
  const [base] = contentDefinitions();
  if (!base) throw new Error('Missing collection');
  return { ...base, fields };
}
function scope() {
  return { limits: contentLimits(), functions: { budget: { used: 0 } } };
}

it('regression: independent async validate permissions can allow validation while writes remain denied', async () => {
  const definition = collection([
    {
      id: 'value',
      name: 'value',
      type: 'text',
      access: {
        write: { version: 'deny', run: () => Promise.resolve(false) },
        validate: {
          version: 'validation',
          run: (input) =>
            Promise.resolve(
              input.operation === 'documents.validate' &&
                input.previousData?.['value'] === 'old' &&
                input.nextData?.['value'] === 'next',
            ),
        },
      },
    },
  ]);
  await expect(
    assertValidationData({
      ...scope(),
      collection: definition,
      context,
      data: { value: 'next' },
      previous: { value: 'old' },
      next: { value: 'next' },
    }),
  ).resolves.toBeUndefined();
  const denied = collection([
    {
      id: 'value',
      name: 'value',
      type: 'text',
      access: {
        write: { version: 'allow', run: () => Promise.resolve(true) },
        validate: { version: 'deny', run: () => Promise.resolve(false) },
      },
    },
  ]);
  await expect(
    assertValidationData({ ...scope(), collection: denied, context, data: { value: 'next' } }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const fallback = collection([
    {
      id: 'value',
      name: 'value',
      type: 'text',
      access: { write: { version: 'deny', run: () => Promise.resolve(false) } },
    },
  ]);
  await expect(
    assertValidationData({ ...scope(), collection: fallback, context, data: { value: 'next' } }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    assertValidationData({
      ...scope(),
      collection: fallback,
      context,
      data: { value: 'old' },
      previous: { value: 'old' },
      next: { value: 'old' },
    }),
  ).resolves.toBeUndefined();
});

it('regression: async nested access receives immutable persisted root, stable row path, sibling, block and document id', async () => {
  const definition = collection([
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [
        {
          id: 'section',
          key: 'section',
          label: 'Section',
          fields: [
            { id: 'enabled', name: 'enabled', type: 'boolean' },
            {
              id: 'text',
              name: 'text',
              type: 'text',
              access: {
                read: {
                  version: 'row',
                  run: (input) =>
                    Promise.resolve(
                      input.documentId === context.documentId &&
                        input.path === 'blocks.row-1.text' &&
                        input.siblingData?.['enabled'] === true &&
                        input.blockData?.['blockType'] === 'section' &&
                        Object.isFrozen(input) &&
                        Object.isFrozen(input.data) &&
                        Object.isFrozen(input.actor),
                    ),
                },
              },
            },
          ],
        },
      ],
    },
  ]);
  const data = {
    blocks: [
      { id: 'row-1', blockType: 'section', enabled: true, text: 'Allowed' },
      { id: 'row-2', blockType: 'section', enabled: false, text: 'Hidden' },
    ],
  };
  expect(await projectData({ ...scope(), collection: definition, context, data })).toEqual({
    blocks: [
      { id: 'row-1', blockType: 'section', enabled: true, text: 'Allowed' },
      { id: 'row-2', blockType: 'section', enabled: false },
    ],
  });
});

it('regression: async field access shares the invocation budget and cancels pending callbacks on timeout', async () => {
  const allow = { version: 'allow', run: () => Promise.resolve(true) };
  const definition = collection([
    { id: 'first', name: 'first', type: 'text', access: { read: allow } },
    { id: 'second', name: 'second', type: 'text', access: { read: allow } },
  ]);
  await expect(
    projectData({
      ...scope(),
      limits: contentLimits({ maxHookCalls: 1 }),
      collection: definition,
      context,
      data: { first: 'A', second: 'B' },
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  let cancelled = 0;
  const waiting = collection([
    {
      id: 'value',
      name: 'value',
      type: 'text',
      access: {
        read: {
          version: 'waiting',
          run: (input) =>
            new Promise<boolean>((resolve) => {
              input.signal?.addEventListener(
                'abort',
                () => {
                  cancelled += 1;
                  resolve(false);
                },
                { once: true },
              );
            }),
        },
      },
    },
  ]);
  await expect(
    projectData({
      ...scope(),
      limits: contentLimits({ maxHookDurationMs: 20 }),
      collection: waiting,
      context,
      data: { value: 'Waiting' },
    }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(cancelled).toBe(1);
});
