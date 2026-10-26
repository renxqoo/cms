import { z } from 'zod';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
  createPublicFixture,
  createPublicModel,
} from '../../../../../../test/support/public-runtime.ts';
import { publicDeliveryOptions } from '../../../../../../test/support/public-content.ts';
const fixtures: Awaited<ReturnType<typeof createPublicFixture>>[] = [];
async function fixture() {
  const kit = await createPublicFixture();
  fixtures.push(kit);
  return kit;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((kit) => kit.close()));
});

it('exports keyset batches with zero-based complete canonical frames and an independently verified digest', async () => {
  const kit = await fixture();
  for (const slug of ['alpha', 'beta', 'gamma'])
    await createPublicModel(kit, { slug, modelId: `${slug}-business-id` });
  const options = publicDeliveryOptions();
  options.policy.exportBatchSize = 1;
  const delivery = kit.content.createDelivery(options);
  const chunks: string[] = [];
  await delivery.exportContent({ kind: 'model-guides', locale: 'en' }, (chunk) => {
    chunks.push(Buffer.from(chunk).toString('utf8'));
    return Promise.resolve();
  });
  const frames = chunks.map((chunk) => z.record(z.string(), z.unknown()).parse(JSON.parse(chunk)));
  expect(frames[0]).toMatchObject({ type: 'start', locale: 'en', kind: 'model-guides' });
  expect(frames.slice(1, -1).map((frame) => frame['sequence'])).toEqual([0, 1, 2]);
  expect(frames.at(-1)).toEqual({
    type: 'end',
    count: 3,
    digest: createHash('sha256').update(chunks.slice(1, -1).join('')).digest('hex'),
  });
  expect(
    new Set(
      frames.slice(1, -1).map((frame) => z.object({ id: z.string() }).parse(frame['data']).id),
    ).size,
  ).toBe(3);
  expect(chunks.every((line) => line.endsWith('\n') && !line.endsWith('\n\n'))).toBe(true);
});

it('admits one export per instance, cancels backpressure and releases the slot and database connection', async () => {
  const kit = await fixture();
  const controller = new AbortController();
  let entered: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const exporting = kit.delivery.exportContent(
    { kind: 'documents', locale: 'en' },
    () => {
      entered?.();
      return new Promise<void>(() => {});
    },
    controller.signal,
  );
  await ready;
  await expect(
    kit.delivery.exportContent({ kind: 'documents' }, () => Promise.resolve()),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  controller.abort(new Error('Client disconnected'));
  await expect(exporting).rejects.toThrow('Client disconnected');
  const chunks: string[] = [];
  await kit.delivery.exportContent({ kind: 'documents' }, (chunk) => {
    chunks.push(Buffer.from(chunk).toString('utf8'));
    return Promise.resolve();
  });
  expect(JSON.parse(chunks.at(-1) ?? '{}')).toMatchObject({ type: 'end', count: 0 });
  expect((await kit.database.query('SELECT 1 AS available')).rows).toEqual([{ available: 1 }]);
});

it('ends oversized exports with an error frame and never sends a successful end', async () => {
  const kit = await fixture();
  await createPublicModel(kit);
  await createPublicModel(kit, { slug: 'beta', modelId: 'beta-key' });
  const options = publicDeliveryOptions();
  options.policy.exportMaxItems = 1;
  const delivery = kit.content.createDelivery(options);
  const chunks: string[] = [];
  await expect(
    delivery.exportContent({ kind: 'model-guides', locale: 'en' }, (chunk) => {
      chunks.push(Buffer.from(chunk).toString('utf8'));
      return Promise.resolve();
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  expect(chunks.map((line) => z.object({ type: z.string() }).parse(JSON.parse(line)).type)).toEqual(
    ['start', 'item', 'error'],
  );
  await expect(
    delivery.exportContent({ kind: 'model-guides', bucket: 1 }, () => Promise.resolve()),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
