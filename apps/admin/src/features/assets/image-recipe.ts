import { imageRecipeSchema } from '../../contracts/assets';
import type { ImageRecipe, AssetManifest } from '../../contracts/assets';
import type { ImageEdits } from '../../components/cms/image-adjustments';
import type { AssetBudget } from './document-asset-types';

export interface VariantDraft {
  id: string;
  name: string;
  width: string;
  height: string;
  fit: string;
  format: string;
  quality: string;
}

export function recipeEdits(
  recipe: ImageRecipe,
  dimensions: { width: number; height: number },
): ImageEdits {
  const crop = recipe.crop ?? { left: 0, top: 0, ...dimensions };
  return {
    crop: {
      x: crop.left / dimensions.width,
      y: crop.top / dimensions.height,
      width: crop.width / dimensions.width,
      height: crop.height / dimensions.height,
    },
    focalPoint: recipe.focalPoint ?? { x: 0.5, y: 0.5 },
  };
}

export function editsRecipe(
  edits: ImageEdits,
  dimensions: { width: number; height: number },
): Pick<ImageRecipe, 'crop' | 'focalPoint'> | null {
  if (
    ![dimensions.width, dimensions.height].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  )
    return null;
  const values = [...Object.values(edits.crop), ...Object.values(edits.focalPoint)];
  if (
    !values.every(Number.isFinite) ||
    values.some((value) => value < 0 || value > 1) ||
    edits.crop.width <= 0 ||
    edits.crop.height <= 0 ||
    edits.crop.x + edits.crop.width > 1 ||
    edits.crop.y + edits.crop.height > 1
  )
    return null;
  const left = Math.min(dimensions.width - 1, Math.round(edits.crop.x * dimensions.width));
  const top = Math.min(dimensions.height - 1, Math.round(edits.crop.y * dimensions.height));
  const right = Math.min(
    dimensions.width,
    Math.max(left + 1, Math.round((edits.crop.x + edits.crop.width) * dimensions.width)),
  );
  const bottom = Math.min(
    dimensions.height,
    Math.max(top + 1, Math.round((edits.crop.y + edits.crop.height) * dimensions.height)),
  );
  return {
    crop: { left, top, width: right - left, height: bottom - top },
    focalPoint: { ...edits.focalPoint },
  };
}

export function variantDrafts(recipe: ImageRecipe, createId: () => string): VariantDraft[] {
  return recipe.variants.map((variant) => ({
    id: createId(),
    name: variant.name,
    width: String(variant.width),
    height: String(variant.height),
    fit: variant.fit,
    format: variant.format,
    quality: String(variant.quality),
  }));
}

export function parsedVariants(rows: readonly VariantDraft[]) {
  if (
    rows.some((row) => [row.width, row.height, row.quality].some((value) => !/^\d+$/.test(value)))
  )
    return null;
  return rows.map(({ name, width, height, fit, format, quality }) => ({
    name,
    width: Number(width),
    height: Number(height),
    fit,
    format,
    quality: Number(quality),
  }));
}

export function validRecipe(
  input: unknown,
  manifest: AssetManifest,
  budget: AssetBudget,
): ImageRecipe | null {
  const parsed = imageRecipeSchema.safeParse(input);
  if (!parsed.success) return null;
  const recipe = parsed.data;
  const names = new Set(recipe.variants.map((variant) => variant.name));
  if (
    names.size !== recipe.variants.length ||
    names.has('original') ||
    recipe.variants.length > budget.maxVariants
  )
    return null;
  if (
    recipe.variants.some(
      (variant) =>
        variant.width > budget.maxWidth ||
        variant.height > budget.maxHeight ||
        variant.width * variant.height > budget.maxPixels,
    )
  )
    return null;
  const { crop } = recipe;
  if (
    crop &&
    (!manifest.width ||
      !manifest.height ||
      crop.left + crop.width > manifest.width ||
      crop.top + crop.height > manifest.height)
  )
    return null;
  return recipe;
}
