import { expect, it } from 'vitest';
import { manifestEdits, pixelRecipe, recipeWithinBudget } from '../image-recipe';
import { resourceHref, resourceQuery } from '../resource-query';
import { editor, manifest } from './support';

it('converts normalized image edits to bounded integer pixels from real original dimensions', () => {
  expect(
    pixelRecipe(
      manifest,
      { crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 }, focalPoint: { x: 0.75, y: 0.2 } },
      [],
    ),
  ).toEqual({
    variants: [],
    crop: { left: 50, top: 10, width: 100, height: 80 },
    focalPoint: { x: 0.75, y: 0.2 },
  });
  expect(pixelRecipe({ ...manifest, width: null }, manifestEdits(manifest), [])).toBeNull();
  expect(
    pixelRecipe(
      manifest,
      { crop: { x: 1, y: 0, width: 0.5, height: 1 }, focalPoint: { x: 0, y: 0 } },
      [],
    ),
  ).toBeNull();
  expect(
    manifestEdits({
      ...manifest,
      recipe: {
        variants: [],
        crop: { left: 20, top: 10, width: 100, height: 50 },
        focalPoint: { x: 0.2, y: 0.9 },
      },
    }),
  ).toEqual({ crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, focalPoint: { x: 0.2, y: 0.9 } });
});

it('rejects duplicate names, original replacement, invalid quality and variants exceeding safe metadata budgets', () => {
  if (!editor.upload) throw new Error('Fixture requires upload limits');
  const variant = {
    name: 'thumb',
    width: 100,
    height: 50,
    quality: 80,
    fit: 'inside' as const,
    format: 'webp' as const,
  };
  expect(recipeWithinBudget({ variants: [variant] }, editor.upload)).toBe(true);
  expect(recipeWithinBudget({ variants: [variant, variant] }, editor.upload)).toBe(false);
  for (const changes of [
    { name: 'original' },
    { quality: 0 },
    { width: 1001 },
    { height: 1001 },
    { width: 400, height: 400 },
  ])
    expect(recipeWithinBudget({ variants: [{ ...variant, ...changes }] }, editor.upload)).toBe(
      false,
    );
  expect(
    recipeWithinBudget(
      { variants: [variant, { ...variant, name: 'two' }, { ...variant, name: 'three' }] },
      editor.upload,
    ),
  ).toBe(false);
});

it('keeps resource filters in the server whitelist and separates upload-selection query keys', () => {
  expect(
    resourceQuery(
      new URLSearchParams('page=-1&pageSize=101&q=report&mode=published&trashed=true&secret=x'),
    ),
  ).toEqual({
    page: 1,
    pageSize: 20,
    q: 'report',
    mode: 'published',
    trashed: true,
    fallback: [],
    depth: 0,
  });
  const query = new URL(
    resourceHref(new URLSearchParams('page=3&collection=media&uploadId=id&secret=x'), {
      q: 'new',
      uploadId: undefined,
    }),
    'http://example.test',
  ).searchParams;
  expect(query.get('page')).toBe('1');
  expect(query.get('collection')).toBe('media');
  expect(query.has('secret')).toBe(false);
  expect(query.has('uploadId')).toBe(false);
  expect(query.get('q')).toBe('new');
  expect(resourceQuery(new URLSearchParams('page=2&pageSize=50&mode=other&trashed=no')).page).toBe(
    2,
  );
});
