import sharp from 'sharp';
import type { Sharp, OutputInfo } from 'sharp';
import { Readable } from 'node:stream';
import type {
  ImageProcessor,
  ProcessedImage,
  ImageRecipe,
  AssetLimits,
  VariantRecipe,
} from '@new-cms/cms/assets/composition';

function requireDimensions(
  input: { width?: number | undefined; height?: number | undefined; pages?: number | undefined },
  limits: AssetLimits,
) {
  const { width, height } = input;
  if (
    !width ||
    !height ||
    width > limits.maxWidth ||
    height > limits.maxHeight ||
    width * height > limits.maxPixels ||
    (input.pages ?? 1) > limits.maxFrames
  )
    throw new Error('Image dimensions exceed limits');
  return { width, height };
}

function variantPipeline(
  pipeline: Sharp,
  input: { recipe: ImageRecipe; variant: VariantRecipe; width: number; height: number },
): Sharp {
  const { recipe, variant } = input;
  const crop = recipe.crop ?? { left: 0, top: 0, width: input.width, height: input.height };
  if (crop.left + crop.width > input.width || crop.top + crop.height > input.height)
    throw new Error('Crop is outside the image');
  let region = crop;
  if (recipe.focalPoint && variant.fit === 'cover') {
    const ratio = variant.width / variant.height;
    const width = Math.max(1, Math.min(crop.width, Math.round(crop.height * ratio)));
    const height = Math.max(1, Math.min(crop.height, Math.round(crop.width / ratio)));
    const left =
      crop.left +
      Math.min(
        crop.width - width,
        Math.max(0, Math.round(recipe.focalPoint.x * crop.width - width / 2)),
      );
    const top =
      crop.top +
      Math.min(
        crop.height - height,
        Math.max(0, Math.round(recipe.focalPoint.y * crop.height - height / 2)),
      );
    region = { left, top, width, height };
  }
  return pipeline
    .extract(region)
    .resize({ width: variant.width, height: variant.height, fit: variant.fit })
    .toFormat(variant.format, { quality: variant.quality });
}

export function createSharpProcessor(): ImageProcessor {
  const active = new Set<Sharp>();
  const pending = new Set<Promise<ProcessedImage>>();
  const controller = new AbortController();
  let closed = false;
  return {
    version: `sharp:${sharp.versions.sharp}:vips:${sharp.versions.vips}`,
    async process(input) {
      if (closed) throw new Error('Image processor is closed');
      const signal = AbortSignal.any([input.signal, controller.signal]);
      const task = processImage({ ...input, signal }, active);
      pending.add(task);
      try {
        return await task;
      } finally {
        pending.delete(task);
      }
    },
    async close() {
      closed = true;
      controller.abort();
      for (const source of active) source.destroy();
      await Promise.allSettled(pending);
      active.clear();
    },
  };
}

async function processImage(input: Parameters<ImageProcessor['process']>[0], active: Set<Sharp>) {
  input.signal.throwIfAborted();
  const source = sharp(input.bytes, {
    limitInputPixels: input.limits.maxPixels,
    failOn: 'warning',
    animated: true,
  }).timeout({ seconds: Math.ceil(input.limits.processingTimeoutMs / 1000) });
  active.add(source);
  const abort = () => {
    source.destroy();
  };
  input.signal.addEventListener('abort', abort, { once: true });
  try {
    const result = await render(source, input, active);
    input.signal.throwIfAborted();
    return result;
  } finally {
    input.signal.removeEventListener('abort', abort);
    active.delete(source);
    source.destroy();
  }
}

async function render(
  source: Sharp,
  input: Parameters<ImageProcessor['process']>[0],
  active: Set<Sharp>,
) {
  const metadata = await source.metadata();
  input.signal.throwIfAborted();
  const dimensions = requireDimensions(metadata, input.limits);
  if (metadata.format && `image/${metadata.format}` !== input.mimeType)
    throw new Error('Image type does not match');
  await source.stats();
  input.signal.throwIfAborted();
  const rotated = source.clone().autoOrient();
  active.add(rotated);
  const orientation = metadata.orientation ?? 1;
  const swap = orientation >= 5;
  const width = swap ? dimensions.height : dimensions.width;
  const height = swap ? dimensions.width : dimensions.height;
  const variants = [];
  let remaining = input.limits.maxOutputBytes;
  try {
    for (const variant of input.recipe.variants) {
      const output = await renderVariant(
        rotated,
        {
          ...input,
          limits: { ...input.limits, maxOutputBytes: remaining },
          variant,
          width,
          height,
        },
        active,
      );
      variants.push(output);
      remaining -= output.bytes.byteLength;
    }
    input.signal.throwIfAborted();
    return { width, height, orientation, variants };
  } finally {
    active.delete(rotated);
    rotated.destroy();
  }
}

async function renderVariant(
  source: Sharp,
  input: Parameters<ImageProcessor['process']>[0] & {
    variant: VariantRecipe;
    width: number;
    height: number;
  },
  active: Set<Sharp>,
) {
  const pipeline = variantPipeline(source.clone(), input);
  active.add(pipeline);
  const abort = () => {
    pipeline.destroy();
  };
  input.signal.addEventListener('abort', abort, { once: true });
  try {
    let info: OutputInfo | undefined;
    pipeline.once('info', (outputInfo: OutputInfo) => {
      info = outputInfo;
    });
    const bytes = await readOutput(pipeline, input);
    input.signal.throwIfAborted();
    if (!info) throw new Error('Image output has no dimensions');
    return {
      name: input.variant.name,
      bytes,
      mimeType: `image/${input.variant.format}`,
      width: info.width,
      height: info.height,
    };
  } finally {
    input.signal.removeEventListener('abort', abort);
    active.delete(pipeline);
    pipeline.destroy();
  }
}

async function readOutput(
  pipeline: Sharp,
  input: { limits: AssetLimits; signal: AbortSignal },
): Promise<Uint8Array> {
  if (input.limits.maxOutputBytes < 1) throw new Error('Image output exceeds limits');
  const buffer = Buffer.allocUnsafe(input.limits.maxOutputBytes);
  const reader = Readable.toWeb(pipeline).getReader();
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      input.signal.throwIfAborted();
      if (next.done) break;
      const chunk: unknown = next.value;
      if (!(chunk instanceof Uint8Array)) throw new Error('Invalid image output');
      if (chunk.byteLength > buffer.byteLength - size)
        throw new Error('Image output exceeds limits');
      buffer.set(chunk, size);
      size += chunk.byteLength;
    }
    return buffer.subarray(0, size);
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
