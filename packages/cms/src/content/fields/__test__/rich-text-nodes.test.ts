import { expect, it } from 'vitest';
import { z } from 'zod';
import { contentLimits } from '../../../../../../test/support/content.ts';
import type { DocumentData, RichTextNodeRegistration } from '../../definition.ts';
import {
  registeredNodeReferences,
  validateNodeRegistrations,
  validateRegisteredNode,
} from '../rich-text-nodes.ts';

const limits = contentLimits();
const id = '10000000-0000-4000-8000-00000000000a';
const otherId = '10000000-0000-4000-8000-00000000000b';
const target = { collection: 'media', id };
const payloadSchema = z.strictObject({
  caption: z.string(),
  assets: z.array(z.strictObject({ collection: z.literal('media'), id: z.uuid() })),
});
function registration(): RichTextNodeRegistration {
  return {
    type: 'mediaCard',
    version: '3',
    validate: { version: '2', run: (payload) => payloadSchema.safeParse(payload).success },
    references: { version: '5', run: () => [{ ...target, path: 'assets.0', media: true }] },
  };
}
function node(): DocumentData {
  return {
    type: 'mediaCard',
    version: '3',
    payload: { caption: 'Private image', assets: [target] },
  };
}
function input(registrations = [registration()]) {
  return { node: node(), registrations, limits };
}
function references(registrations = [registration()]) {
  return registeredNodeReferences({
    ...input(registrations),
    path: 'body.children.2',
    fieldId: 'body',
  });
}

it('validates versioned custom payloads and emits fixed references to their actual canonical payload paths', () => {
  const original = input();
  const before = structuredClone(original.node);
  expect(() => validateNodeRegistrations(original.registrations)).not.toThrow();
  expect(validateRegisteredNode(original)).toBe(true);
  expect(references()).toEqual([
    {
      collection: 'media',
      id,
      path: 'body.children.2.payload.assets.0',
      fieldId: 'body',
      onDelete: 'restrict',
      media: true,
    },
  ]);
  expect(original.node).toEqual(before);
});
it('returns control to builtin or unknown node handlers without claiming their payload or references', () => {
  const original = input();
  expect(validateRegisteredNode({ ...original, node: { type: 'paragraph', children: [] } })).toBe(
    false,
  );
  expect(
    validateRegisteredNode({ ...original, node: { type: 'unregistered', payload: 'text' } }),
  ).toBe(false);
  expect(
    registeredNodeReferences({
      ...original,
      node: { type: 'unregistered' },
      path: 'body',
      fieldId: 'body',
    }),
  ).toEqual([]);
  const custom = registration();
  const { references: _references, ...withoutExtractor } = custom;
  expect(references([withoutExtractor])).toEqual([]);
});
it.each(['text', 'relationship', 'media', 'paragraph', 'heading', 'list', 'listItem', 'link'])(
  'rejects custom registration overriding builtin %s',
  (type) => {
    expect(() => validateNodeRegistrations([{ ...registration(), type }])).toThrowError(
      'invalid input',
    );
  },
);
it('rejects duplicate, malformed and unversioned registrations before dispatch', () => {
  expect(() => validateNodeRegistrations([registration(), registration()])).toThrowError(
    'invalid input',
  );
  for (const type of ['', '__proto__', 'unsafe.type', 'a'.repeat(65)]) {
    expect(() => validateNodeRegistrations([{ ...registration(), type }])).toThrowError(
      'invalid input',
    );
  }
  for (const version of ['', ' ', ' padded', 'a'.repeat(129)]) {
    expect(() => validateNodeRegistrations([{ ...registration(), version }])).toThrowError(
      'invalid input',
    );
    expect(() =>
      validateNodeRegistrations([{ ...registration(), validate: { version, run: () => true } }]),
    ).toThrowError('invalid input');
    expect(() =>
      validateNodeRegistrations([{ ...registration(), references: { version, run: () => [] } }]),
    ).toThrowError('invalid input');
  }
  const unknown = registration();
  Reflect.set(unknown, 'renderHtml', () => '<script>bad</script>');
  expect(() => validateNodeRegistrations([unknown])).toThrowError('invalid input');
  const asyncValidator = registration();
  Reflect.set(asyncValidator.validate, 'run', async () => Promise.resolve(true));
  expect(() => validateNodeRegistrations([asyncValidator])).toThrowError('invalid input');
  const missingValidator = registration();
  Reflect.set(missingValidator, 'validate', null);
  expect(() => validateNodeRegistrations([missingValidator])).toThrowError('invalid input');
});
it('rejects stale node versions, extra node properties and payload keys outside the registered schema', () => {
  const original = input();
  for (const malformed of [
    { ...node(), version: '2' },
    { ...node(), version: 3 },
    { type: 'mediaCard', version: '3' },
    { ...node(), children: [] },
    { ...node(), payload: { caption: 'Text', assets: [], html: '<script>bad</script>' } },
    { ...node(), payload: { caption: 12, assets: [] } },
  ]) {
    expect(() => validateRegisteredNode({ ...original, node: malformed })).toThrowError(
      'invalid input',
    );
  }
  const arbitraryText = {
    ...node(),
    payload: { caption: '<script>text only</script>', assets: [] },
  };
  expect(validateRegisteredNode({ ...original, node: arbitraryText })).toBe(true);
});
it('passes deeply immutable payload snapshots to synchronous callbacks and rejects callback mutation or throws', () => {
  const custom = registration();
  custom.validate.run = (payload) => {
    expect(Object.isFrozen(payload)).toBe(true);
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
    expect(Object.isFrozen(payload['assets'])).toBe(true);
    payload['caption'] = 'Changed';
    return true;
  };
  const original = input([custom]);
  expect(() => validateRegisteredNode(original)).toThrowError('invalid input');
  expect(original.node).toEqual(node());
  const throwing = registration();
  throwing.validate.run = () => {
    throw new Error('Private implementation detail');
  };
  expect(() => validateRegisteredNode(input([throwing]))).toThrowError('invalid input');
});
it('rejects unexpected asynchronous callback output and consumes its rejected promise', async () => {
  const validator = registration();
  Reflect.set(validator.validate, 'run', () => Promise.reject(new Error('Rejected validator')));
  expect(() => validateRegisteredNode(input([validator]))).toThrowError('invalid input');
  const extractor = registration();
  Reflect.set(extractor.references ?? {}, 'run', () =>
    Promise.reject(new Error('Rejected extractor')),
  );
  expect(() => references([extractor])).toThrowError('invalid input');
  await Promise.resolve();
});
it('rejects unbounded, cyclic and non-JSON custom payloads before trusted callbacks run', () => {
  const original = input();
  let deep: unknown = 'value';
  for (let index = 0; index < 10000; index += 1) deep = { nested: deep };
  Reflect.set(original.node, 'payload', deep);
  expect(() => validateRegisteredNode(original)).toThrowError('payload too large');
  Reflect.set(original.node, 'payload', { text: 'a'.repeat(limits.maxDataBytes + 1) });
  expect(() => validateRegisteredNode(original)).toThrowError('payload too large');
  Reflect.set(
    original.node,
    'payload',
    Array.from({ length: limits.maxArrayItems + 1 }, () => null),
  );
  expect(() => validateRegisteredNode(original)).toThrowError('payload too large');
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  Reflect.set(original.node, 'payload', cycle);
  expect(() => validateRegisteredNode(original)).toThrowError('invalid input');
  Reflect.set(original.node, 'payload', { invalid: new Date() });
  expect(() => validateRegisteredNode(original)).toThrowError('invalid input');
});
it('allows canonical payload-root references and normalizes UUIDs without changing their stored payload', () => {
  const custom: RichTextNodeRegistration = {
    type: 'linkCard',
    version: '1',
    validate: { version: '1', run: () => true },
    references: { version: '1', run: () => [{ ...target, path: '' }] },
  };
  const root = { type: 'linkCard', version: '1', payload: { ...target, id: id.toUpperCase() } };
  expect(
    registeredNodeReferences({
      node: root,
      registrations: [custom],
      limits,
      path: 'body.children.0',
      fieldId: 'body',
    }),
  ).toEqual([
    {
      collection: 'media',
      id,
      path: 'body.children.0.payload',
      fieldId: 'body',
      onDelete: 'restrict',
      media: false,
    },
  ]);
  expect(root.payload.id).toBe(id.toUpperCase());
});
it.each([
  { ...target, path: 'assets.0', id: otherId },
  { ...target, path: 'assets.1' },
  { ...target, path: 'assets.00' },
  { ...target, path: 'assets.-1' },
  { ...target, path: 'assets.length' },
  { ...target, path: 'assets.9007199254740992' },
  { ...target, path: '__proto__.target' },
  { ...target, path: 'constructor.prototype.target' },
  { ...target, path: 'assets..0' },
  { ...target, path: 'assets.0.id' },
  { ...target, path: 'assets.0', collection: 'Other' },
  { ...target, path: 'assets.0', id: 'not-a-uuid' },
  { ...target, path: 'assets.0', media: 'true' },
  { ...target, path: 'assets.0', html: '<script>bad</script>' },
])(
  'rejects extracted references that cannot prove their exact canonical payload location: %j',
  (candidate) => {
    const custom = registration();
    Reflect.set(custom, 'references', { version: '1', run: () => [candidate] });
    expect(() => references([custom])).toThrowError('invalid input');
  },
);
it('rejects duplicate paths, non-array extraction and excessive generated references', () => {
  const custom = registration();
  custom.references = {
    version: '1',
    run: () => [
      { ...target, path: 'assets.0' },
      { ...target, path: 'assets.0' },
    ],
  };
  expect(() => references([custom])).toThrowError('invalid input');
  Reflect.set(custom, 'references', { version: '1', run: () => ({ ...target, path: 'assets.0' }) });
  expect(() => references([custom])).toThrowError('invalid input');
  custom.references = {
    version: '1',
    run: () =>
      Array.from({ length: limits.maxRichTextNodes + 1 }, () => ({ ...target, path: 'assets.0' })),
  };
  expect(() => references([custom])).toThrowError('payload too large');
});
