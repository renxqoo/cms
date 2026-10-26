'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Banner } from '@new-cms/ui/feedback';
import { ImageAdjustments } from '../../components/cms/image-adjustments';
import type { ImageEdits } from '../../components/cms/image-adjustments';
import { useShell } from '../../components/shell/shell-provider';
import type { AssetManifest, ImageRecipe } from '../../contracts/assets';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import type { AssetBudget, AssetPreviewTarget } from './document-asset-types';
import { useAssetFile, useBlobUrl } from './use-asset-file';
import {
  editsRecipe,
  parsedVariants,
  recipeEdits,
  validRecipe,
  variantDrafts,
} from './image-recipe';
import type { VariantDraft } from './image-recipe';
import { VariantFields } from './variant-fields';
import type { AssetMessages } from './messages';
import { assetMessages } from './messages';

interface RecipeDialogProps {
  target: AssetPreviewTarget;
  manifest: AssetManifest;
  budget: AssetBudget;
  pending: boolean;
  locked: boolean;
  onClose: () => void;
  onRun: (recipe: ImageRecipe) => void;
  feedback: ReactNode;
}

export function ImageRecipeDialog(props: RecipeDialogProps) {
  const t = assetMessages[useShell((state) => state.locale)];
  const result = useAssetFile(props.target);
  const blob = availableBlob(result);
  const url = useBlobUrl(blob);
  const dimensions = imageDimensions(props.manifest);
  const [variants, setVariants] = useState(() =>
    variantDrafts(props.manifest.recipe, () => crypto.randomUUID()),
  );
  const [applied, setApplied] = useState<Pick<ImageRecipe, 'crop' | 'focalPoint'>>(() =>
    appliedRecipe(props.manifest.recipe),
  );
  const [edits, setEdits] = useState<ImageEdits>(() =>
    recipeEdits(props.manifest.recipe, dimensions),
  );
  const parsed = parsedVariants(variants);
  const recipe = parsed
    ? validRecipe({ ...applied, variants: parsed }, props.manifest, props.budget)
    : null;
  const unapplied =
    JSON.stringify(edits) !== JSON.stringify(recipeEdits({ ...applied, variants: [] }, dimensions));
  const unavailable =
    !result.allowed ||
    !url ||
    result.error !== null ||
    dimensions.width < 1 ||
    dimensions.height < 1;
  function apply(next: ImageEdits) {
    const value = editsRecipe(next, dimensions);
    if (!value) return;
    setApplied(value);
    setEdits(recipeEdits({ ...value, variants: [] }, dimensions));
  }
  return (
    <ManagementDialog
      open
      dirty={recipeDraftChanged({
        original: props.manifest.recipe,
        dimensions,
        variants,
        applied,
        edits,
      })}
      title={t.recipe}
      description={t.cropNotice}
      onClose={props.onClose}
      pending={props.pending}
      locked={props.locked}
      disabled={props.pending || props.locked || !recipe || unapplied || unavailable}
      submitLabel={t.saveRecipe}
      onSubmit={() => {
        if (recipe && !unapplied && !unavailable) props.onRun(recipe);
      }}
      feedback={
        <>
          <ManagementFeedback error={result.error} onRetry={result.reload} />
          {props.feedback}
        </>
      }
    >
      {unavailable ? (
        <Banner>{unavailableMessage(result, t)}</Banner>
      ) : (
        <ImageAdjustments
          image={{ src: url, alt: props.manifest.filename, ...dimensions }}
          value={edits}
          onChange={setEdits}
          onApply={apply}
          readOnly={props.pending || props.locked}
          labels={{
            preview: t.preview,
            cropX: t.cropX,
            cropY: t.cropY,
            cropWidth: t.cropWidth,
            cropHeight: t.cropHeight,
            focalX: t.focalX,
            focalY: t.focalY,
            apply: t.applyCrop,
            error: t.invalidRecipe,
          }}
        />
      )}
      <VariantFields
        rows={variants}
        maximum={props.budget.maxVariants}
        onChange={setVariants}
        readOnly={props.pending || props.locked}
      />
      {!recipe ? (
        <p role="alert" className="text-sm text-destructive">
          {t.invalidRecipe}
        </p>
      ) : null}
    </ManagementDialog>
  );
}

function imageDimensions(manifest: AssetManifest) {
  return { width: manifest.width ?? 0, height: manifest.height ?? 0 };
}
function appliedRecipe(recipe: ImageRecipe): Pick<ImageRecipe, 'crop' | 'focalPoint'> {
  return {
    ...(recipe.crop ? { crop: recipe.crop } : {}),
    ...(recipe.focalPoint ? { focalPoint: recipe.focalPoint } : {}),
  };
}
function availableBlob(result: ReturnType<typeof useAssetFile>) {
  return result.allowed && !result.error ? (result.data?.blob ?? null) : null;
}
function unavailableMessage(result: ReturnType<typeof useAssetFile>, t: AssetMessages) {
  if (!result.allowed) return t.denied;
  return result.phase === 'loading' ? t.loading : t.unavailable;
}

function recipeDraftChanged({
  original,
  dimensions,
  variants,
  applied,
  edits,
}: {
  original: ImageRecipe;
  dimensions: { width: number; height: number };
  variants: readonly VariantDraft[];
  applied: Pick<ImageRecipe, 'crop' | 'focalPoint'>;
  edits: ImageEdits;
}) {
  const rows = variants.map(({ id: _id, ...value }) => value);
  const previous = variantDrafts(original, () => '').map(({ id: _id, ...value }) => value);
  return (
    JSON.stringify(rows) !== JSON.stringify(previous) ||
    JSON.stringify(applied) !== JSON.stringify(appliedRecipe(original)) ||
    JSON.stringify(edits) !== JSON.stringify(recipeEdits(original, dimensions))
  );
}
