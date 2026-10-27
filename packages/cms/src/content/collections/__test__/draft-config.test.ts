import { expect, it } from 'vitest';
import { createRegistry } from '../../generate.ts';
import { contentDefinitions, contentLimits } from '../../../../../../test/support/content.ts';

it('compiles equivalent draft defaults into one behavior configuration and bounds timer intervals', () => {
  const collections = contentDefinitions();
  const article = collections.find((item) => item.mode === 'drafts');
  if (!article) throw new Error('Missing draft collection');
  delete article.drafts;
  const defaults = createRegistry({ collections, limits: contentLimits() });
  article.drafts = { validate: false, autosave: false, schedule: false };
  expect(createRegistry({ collections, limits: contentLimits() }).behaviorHash).toBe(
    defaults.behaviorHash,
  );
  article.drafts = { autosave: true };
  const enabled = createRegistry({ collections, limits: contentLimits() });
  article.drafts = { autosave: { intervalMs: 2000 } };
  expect(createRegistry({ collections, limits: contentLimits() }).behaviorHash).toBe(
    enabled.behaviorHash,
  );
  for (const intervalMs of [0, -1, 0.5, 2147483648]) {
    article.drafts = { autosave: { intervalMs } };
    expect(() => createRegistry({ collections, limits: contentLimits() })).toThrow('invalid input');
  }
});
it('rejects draft controls on a direct collection instead of accepting unused configuration', () => {
  const collections = contentDefinitions();
  const direct = collections.find((item) => item.mode === 'direct');
  if (!direct) throw new Error('Missing direct collection');
  direct.drafts = { autosave: true };
  expect(() => createRegistry({ collections, limits: contentLimits() })).toThrow('invalid input');
});
