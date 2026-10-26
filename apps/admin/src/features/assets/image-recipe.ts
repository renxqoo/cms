import { imageRecipeSchema } from '../../contracts/assets';
import type { ImageRecipe, Manifest } from '../../contracts/assets';
import type { CollectionEditor } from '../../contracts/editor';
import type { ImageEdits } from '../../components/cms/image-adjustments';

export function manifestEdits(manifest: Manifest): ImageEdits {
  const width = manifest.width ?? 1;
  const height = manifest.height ?? 1;
  const { crop } = manifest.recipe;
  return {
    crop: crop
      ? {
          x: crop.left / width,
          y: crop.top / height,
          width: crop.width / width,
          height: crop.height / height,
        }
      : { x: 0, y: 0, width: 1, height: 1 },
    focalPoint: manifest.recipe.focalPoint ?? { x: 0.5, y: 0.5 },
  };
}

export function pixelRecipe(
  manifest: Manifest,
  edits: ImageEdits,
  variants: ImageRecipe['variants'],
): ImageRecipe | null {
  const { width, height } = manifest;
  if (!width || !height) return null;
  const left = Math.round(edits.crop.x * width);
  const top = Math.round(edits.crop.y * height);
  const cropWidth = Math.min(width - left, Math.round(edits.crop.width * width));
  const cropHeight = Math.min(height - top, Math.round(edits.crop.height * height));
  const parsed = imageRecipeSchema.safeParse({
    variants,
    crop: { left, top, width: cropWidth, height: cropHeight },
    focalPoint: edits.focalPoint,
  });
  if (!parsed.success || left >= width || top >= height) return null;
  return parsed.data;
}

export function recipeWithinBudget(
  recipe: ImageRecipe,
  limits: NonNullable<CollectionEditor['upload']>,
): boolean {
  const parsed = imageRecipeSchema.safeParse(recipe);
  if (!parsed.success || recipe.variants.length > limits.maxVariants) return false;
  if (new Set(recipe.variants.map((variant) => variant.name)).size !== recipe.variants.length)
    return false;
  return recipe.variants.every(
    (variant) =>
      variant.name !== 'original' &&
      variant.width <= limits.maxWidth &&
      variant.height <= limits.maxHeight &&
      variant.width * variant.height <= limits.maxPixels,
  );
}
