import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';
import { createSharpProcessor } from '../sharp.ts';
import type { AssetLimits, ImageRecipe } from '@new-cms/cms/assets/composition';

const limits: AssetLimits = {
  maxUploadBytes: 20971520,
  maxOutputBytes: 20971520,
  maxPixels: 40000000,
  maxFrames: 1,
  maxWidth: 8192,
  maxHeight: 8192,
  uploadConcurrency: 4,
  uploadQueueSize: 8,
  uploadQueueTimeoutMs: 1000,
  uploadTimeoutMs: 60000,
  processingTimeoutMs: 15000,
  sessionTtlMs: 1800000,
  retentionMs: 604800000,
  leaseMs: 30000,
  jobAttempts: 3,
  maintenanceBatchSize: 20,
  maxVariants: 10,
  maxActiveSessionsPerActor: 100,
  maxActiveBytesPerActor: 1073741824,
  maxActiveSessions: 10000,
  maxActiveBytes: 21474836480,
};
const processors: ReturnType<typeof createSharpProcessor>[] = [];
afterEach(async () => {
  for (const renderer of processors.splice(0)) await renderer.close();
});
function processor() {
  const result = createSharpProcessor();
  processors.push(result);
  return result;
}
const recipe: ImageRecipe = {
  variants: [{ name: 'thumb', width: 8, height: 8, fit: 'cover', format: 'png', quality: 90 }],
};

async function stripedImage() {
  const bytes = Buffer.alloc(20 * 10 * 3);
  for (let pixel = 0; pixel < 200; pixel += 1) bytes[pixel * 3 + (pixel % 20 < 10 ? 0 : 2)] = 255;
  return sharp(bytes, { raw: { width: 20, height: 10, channels: 3 } })
    .png()
    .toBuffer();
}

it('uses focal point and crop to derive real pixels and records dimensions', async () => {
  const bytes = await stripedImage();
  const renderer = processor();
  const left = await renderer.process({
    bytes,
    mimeType: 'image/png',
    recipe: { ...recipe, focalPoint: { x: 0, y: 0.5 } },
    limits,
    signal: AbortSignal.timeout(5000),
  });
  const right = await renderer.process({
    bytes,
    mimeType: 'image/png',
    recipe: { ...recipe, focalPoint: { x: 1, y: 0.5 } },
    limits,
    signal: AbortSignal.timeout(5000),
  });
  expect({ width: left.width, height: left.height, orientation: left.orientation }).toEqual({
    width: 20,
    height: 10,
    orientation: 1,
  });
  const [leftVariant] = left.variants;
  const [rightVariant] = right.variants;
  if (!leftVariant || !rightVariant) throw new Error('Expected generated variants');
  expect(leftVariant).toMatchObject({ name: 'thumb', width: 8, height: 8, mimeType: 'image/png' });
  const leftPixels = await sharp(leftVariant.bytes).raw().toBuffer();
  const rightPixels = await sharp(rightVariant.bytes).raw().toBuffer();
  expect([...leftPixels.subarray(0, 3)]).toEqual([255, 0, 0]);
  expect([...rightPixels.subarray(0, 3)]).toEqual([0, 0, 255]);
});

it('rejects malformed bytes, type mismatch, oversized images and invalid crop', async () => {
  const renderer = processor();
  const bytes = await stripedImage();
  const input = { bytes, mimeType: 'image/png', recipe, limits, signal: AbortSignal.timeout(5000) };
  await expect(renderer.process({ ...input, bytes: new Uint8Array([1, 2]) })).rejects.toThrow(/./);
  await expect(renderer.process({ ...input, mimeType: 'image/jpeg' })).rejects.toThrow('type');
  await expect(
    renderer.process({ ...input, limits: { ...limits, maxPixels: 100 } }),
  ).rejects.toThrow(/./);
  await expect(
    renderer.process({
      ...input,
      recipe: { ...recipe, crop: { left: 15, top: 0, width: 10, height: 10 } },
    }),
  ).rejects.toThrow('outside');
});

it('auto-orients JPEG, enforces output limits and honors cancellation/close', async () => {
  const renderer = processor();
  const bytes = await sharp(await stripedImage())
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const input = {
    bytes,
    mimeType: 'image/jpeg',
    recipe,
    limits,
    signal: AbortSignal.timeout(5000),
  };
  expect(await renderer.process(input)).toMatchObject({ width: 10, height: 20, orientation: 6 });
  await expect(
    renderer.process({ ...input, limits: { ...limits, maxOutputBytes: 1 } }),
  ).rejects.toThrow('output');
  const controller = new AbortController();
  controller.abort();
  await expect(renderer.process({ ...input, signal: controller.signal })).rejects.toThrow(/./);
  await renderer.close();
  await expect(renderer.process(input)).rejects.toThrow('closed');
});

it('validates image pixels even when a collection configures no variants', async () => {
  const bytes = await stripedImage();
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.indexOf(Buffer.from('IDAT')) + 4] = 0;
  const input = {
    bytes: corrupt,
    mimeType: 'image/png',
    recipe: { variants: [] },
    limits,
    signal: AbortSignal.timeout(5000),
  };
  await expect(processor().process(input)).rejects.toThrow(/./);
});

it('rejects animated images over the frame budget and cancels active native work', async () => {
  const framePixels = new Uint8Array([255, 0, 0, 0, 0, 255]);
  const animated = await sharp(framePixels, {
    raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
  })
    .gif()
    .toBuffer();
  const renderer = processor();
  const input = {
    bytes: animated,
    mimeType: 'image/gif',
    recipe: { variants: [] },
    limits,
    signal: AbortSignal.timeout(5000),
  };
  await expect(renderer.process(input)).rejects.toThrow('dimensions exceed');
  const controller = new AbortController();
  const pending = renderer.process({
    ...input,
    bytes: await stripedImage(),
    mimeType: 'image/png',
    recipe,
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toThrow(/./);
  const closingWork = renderer.process({
    ...input,
    bytes: await stripedImage(),
    mimeType: 'image/png',
    recipe,
  });
  await renderer.close();
  await expect(closingWork).rejects.toThrow(/./);
});
