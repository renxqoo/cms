import { expect, it } from 'vitest';
import { createRegistry, compileContent } from '../../generate.ts';
import {
  workflowCollections,
  contentCollection,
} from '../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';

it('keeps display and duplication controls out of physical schemas while changing the behavior fingerprint', () => {
  const collections = workflowCollections();
  const base = createRegistry({ collections, limits: contentLimits() });
  const article = contentCollection(collections, 'articles');
  article.fields = article.fields.map((field) =>
    field.name === 'title'
      ? {
          ...field,
          disableDuplicate: true,
          admin: {
            readOnly: true,
            hidden: true,
            description: { en: '', zh: '描述' },
            placeholder: { en: 'Enter title' },
            position: 'sidebar' as const,
            width: 'calc(50% - 1rem)',
          },
        }
      : field,
  );
  const configured = createRegistry({ collections, limits: contentLimits() });
  expect(configured.behaviorHash).not.toBe(base.behaviorHash);
  expect(compileContent(configured).fingerprint).toBe(compileContent(base).fingerprint);
  expect(
    configured.get('articles').fields.find((field) => field.name === 'title')?.admin,
  ).toMatchObject({ description: { en: '', zh: '描述' }, position: 'sidebar' });
});
it('rejects malformed display settings and duplicate controls on non-data layout fields', () => {
  for (const admin of [
    { readOnly: 'yes' },
    { hidden: 'yes' },
    { position: 'footer' },
    { width: -1 },
    { width: '' },
    { description: 'x'.repeat(2001) },
    { placeholder: 'x'.repeat(513) },
  ]) {
    const collections = workflowCollections();
    const article = contentCollection(collections, 'articles');
    const field = article.fields.find((candidate) => candidate.name === 'title');
    if (!field) throw new Error('Title missing');
    Object.assign(field, { admin });
    expect(() => createRegistry({ collections, limits: contentLimits() })).toThrowError(
      expect.objectContaining({ code: 'invalid_input' }),
    );
  }
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    { id: 'layout', type: 'row', disableDuplicate: true, fields: [] },
  ];
  expect(() => createRegistry({ collections, limits: contentLimits() })).toThrowError(
    expect.objectContaining({ code: 'invalid_input' }),
  );
});
