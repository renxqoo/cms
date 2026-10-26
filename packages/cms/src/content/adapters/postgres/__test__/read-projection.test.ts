import { afterEach, expect, it } from 'vitest';
import { projectionFixture, readProjection, saveProjection } from './read-projection-support.ts';
import type { ProjectionFixture } from './read-projection-support.ts';
const resources: ProjectionFixture[] = [];
async function fixture() {
  const kit = await projectionFixture();
  resources.push(kit);
  return kit;
}
afterEach(async () => {
  await Promise.all(resources.splice(0).map((kit) => kit.close()));
});
it('loads three legal large documents as summaries without reading their body tables', async () => {
  const kit = await fixture();
  for (let i = 0; i < 3; i++)
    await saveProjection(kit, { title: `Article ${i}`, body: { text: 'x'.repeat(800000) } });
  const limits = { ...kit.limits, maxStorageBytes: 2097152, maxResponseBytes: 2097152 },
    statements: string[] = [];
  const result = await readProjection(kit, { projection: ['title'], limits, statements });
  expect(result.total).toBe(3);
  expect(result.rows.map((row) => row.data)).toEqual(
    expect.arrayContaining([
      { title: 'Article 0' },
      { title: 'Article 1' },
      { title: 'Article 2' },
    ]),
  );
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(10000);
  const body = kit.artifacts.mapping.get('articles').flat.find((field) => field.path === 'body');
  if (!body) throw new Error('Missing body mapping');
  expect(statements.join('\n')).not.toContain(`"${body.table}"`);
  await expect(readProjection(kit, { limits })).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  await expect(readProjection(kit, { projection: ['body'], limits })).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
});
it('selects only nested binding keys while retaining native array UUIDs and block types', async () => {
  const kit = await fixture(),
    binding = '11111111-1111-4111-8111-111111111111',
    scenario = '22222222-2222-4222-8222-222222222222',
    block = '33333333-3333-4333-8333-333333333333',
    quote = '44444444-4444-4444-8444-444444444444',
    statements: string[] = [];
  await saveProjection(kit, {
    title: 'Nested',
    meta: { headline: 'Heading', description: { private: 'omit' } },
    apiBindings: [
      {
        id: binding,
        key: 'main',
        requestValues: { secret: 'omit' },
        scenarios: [{ id: scenario, key: 'first', body: { omit: true } }],
      },
    ],
    blocks: [
      { id: block, blockType: 'hero', label: 'Hero', body: { private: 'omit' } },
      { id: quote, blockType: 'quote', label: 'Quote', body: { private: 'omit' } },
    ],
  });
  const result = await readProjection(kit, {
    projection: ['meta.headline', 'apiBindings.key', 'apiBindings.scenarios.key', 'blocks.label'],
    statements,
  });
  expect(result.rows[0]?.data).toEqual({
    meta: { headline: 'Heading' },
    apiBindings: [{ id: binding, key: 'main', scenarios: [{ id: scenario, key: 'first' }] }],
    blocks: [
      { id: block, blockType: 'hero', label: 'Hero' },
      { id: quote, blockType: 'quote', label: 'Quote' },
    ],
  });
  for (const field of kit.artifacts.mapping
    .get('articles')
    .flat.filter((item) =>
      [
        'meta.description',
        'apiBindings.requestValues',
        'apiBindings.scenarios.body',
        'blocks.body',
      ].includes(item.path),
    ))
    expect(statements.join('\n')).not.toContain(`"${field.table}"`);
});
it('empty trusted projection returns identities without native values or value-table reads', async () => {
  const kit = await fixture(),
    saved = await saveProjection(kit, { title: 'Identity', body: { text: 'large' } }),
    statements: string[] = [];
  const result = await readProjection(kit, { projection: [], statements });
  expect(result.rows[0]?.data).toEqual({});
  expect(result.rows[0]?.document.id).toBe(saved.id);
  expect(result.rows[0]?.version.id).toBe(saved.versionId);
  expect(statements.join('\n')).not.toContain('content_values');
});
it.each([
  { projection: ['missing'] },
  { projection: ['title', 'title'] },
  { projection: ['body.text'] },
])(
  'rejects unknown or duplicate trusted paths even on an empty result: %j',
  async ({ projection }) => {
    const kit = await fixture();
    await expect(readProjection(kit, { projection })).rejects.toMatchObject({
      code: 'invalid_input',
    });
  },
);

it('keeps null group markers, empty arrays and localized fallback values', async () => {
  const kit = await fixture();
  await saveProjection(kit, { title: 'English fallback', meta: null, apiBindings: [], blocks: [] });
  const result = await readProjection(kit, {
    projection: ['title', 'meta.headline', 'apiBindings.key', 'blocks.label'],
    query: { locale: 'zh', fallback: ['en'] },
  });
  expect(result.rows[0]?.data).toEqual({
    title: 'English fallback',
    meta: null,
    apiBindings: [],
    blocks: [],
  });
});
it('selecting a native parent includes its children without broadening a different field path', async () => {
  const kit = await fixture(),
    meta = { headline: 'Heading', description: { chosen: true } },
    row = {
      id: '11111111-1111-4111-8111-111111111111',
      key: 'main',
      requestValues: { chosen: true },
    };
  await saveProjection(kit, {
    title: 'Unselected',
    body: { private: true },
    meta,
    apiBindings: [row],
  });
  expect(
    (await readProjection(kit, { projection: ['meta', 'apiBindings'] })).rows[0]?.data,
  ).toEqual({ meta, apiBindings: [row] });
});
it('external query.select remains an output policy hint rather than a trusted storage projection', async () => {
  const kit = await fixture();
  await saveProjection(kit, { title: 'Full', body: { retained: 'full source' } });
  const result = await readProjection(kit, { query: { select: ['title'] } });
  expect(result.rows[0]?.data).toEqual({ title: 'Full', body: { retained: 'full source' } });
});
it('an empty output select cannot erase fields requested by an explicit trusted storage projection', async () => {
  const kit = await fixture();
  await saveProjection(kit, { title: 'Trusted summary', body: { retained: 'unselected' } });
  const result = await readProjection(kit, { projection: ['title'], query: { select: [] } });
  expect(result.rows[0]?.data).toEqual({ title: 'Trusted summary' });
  expect((await readProjection(kit, { query: { select: [] } })).rows[0]?.data).toEqual({});
});
it('still enforces response budgets on the final trusted projection', async () => {
  const kit = await fixture();
  await saveProjection(kit, { title: 'x'.repeat(4000) });
  await expect(
    readProjection(kit, {
      projection: ['title'],
      limits: { ...kit.limits, maxResponseBytes: 1000 },
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
});
it('keeps trusted collection predicates and unreadable-field query restrictions when projecting', async () => {
  const kit = await fixture();
  await saveProjection(kit, { title: 'Allowed', secret: 'visible' });
  await saveProjection(kit, { title: 'Denied', secret: 'hidden' });
  const result = await readProjection(kit, {
    projection: ['title'],
    query: { policy: { field: 'secret', operator: 'eq', value: 'visible' } },
    queryableFields: ['title'],
  });
  expect(result.total).toBe(1);
  expect(result.rows.map((row) => row.data)).toEqual([{ title: 'Allowed' }]);
  await expect(
    readProjection(kit, {
      projection: ['title'],
      query: { where: { field: 'secret', operator: 'eq', value: 'visible' } },
      queryableFields: ['title'],
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
