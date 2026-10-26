'use client';

import { useId, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { ImageAdjustments } from '../../components/cms/image-adjustments';
import type { ImageEdits } from '../../components/cms/image-adjustments';
import { useShell } from '../../components/shell/shell-provider';
import type { Manifest, ImageRecipe, ImageVariant } from '../../contracts/assets';
import type { CollectionEditor } from '../../contracts/editor';
import { ManagementDialog } from '../management-shared/management-dialog';
import { PrivateFile } from './private-file';
import type { PrivateFileTarget } from './private-file';
import { assetMessages } from './asset-messages';
import { manifestEdits, pixelRecipe, recipeWithinBudget } from './image-recipe';

interface VariantDraft {
  name: string;
  width: string;
  height: string;
  quality: string;
  fit: ImageVariant['fit'];
  format: ImageVariant['format'];
}

function initialVariants(manifest: Manifest): VariantDraft[] {
  return manifest.recipe.variants.map((variant) => ({
    ...variant,
    width: String(variant.width),
    height: String(variant.height),
    quality: String(variant.quality),
  }));
}

export function ImageDialog({
  target,
  manifest,
  limits,
  onClose,
  onProcess,
  busy,
}: {
  target: PrivateFileTarget;
  manifest: Manifest;
  limits: NonNullable<CollectionEditor['upload']>;
  onClose: () => void;
  onProcess: (recipe: ImageRecipe) => void;
  busy: boolean;
}) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const [edits, setEdits] = useState<ImageEdits>(() => manifestEdits(manifest));
  const [variants, setVariants] = useState(() => initialVariants(manifest));
  const [preview, setPreview] = useState<string | null>(null);
  const recipe = pixelRecipe(
    manifest,
    edits,
    variants.map((variant) => ({
      ...variant,
      width: Number(variant.width),
      height: Number(variant.height),
      quality: Number(variant.quality),
    })),
  );
  const valid = recipe !== null && recipeWithinBudget(recipe, limits);
  const dirty =
    JSON.stringify({ edits, variants }) !==
    JSON.stringify({ edits: manifestEdits(manifest), variants: initialVariants(manifest) });
  function process() {
    if (valid && recipe) onProcess(recipe);
  }
  return (
    <ManagementDialog
      open
      title={t.image}
      onClose={onClose}
      onSubmit={process}
      submitLabel={t.apply}
      disabled={!valid || !preview}
      pending={busy}
      dirty={dirty}
    >
      <PrivateFile target={target} manifest={manifest} onPreview={setPreview} originalOnly />
      {preview && manifest.width && manifest.height ? (
        <ImageAdjustments
          image={{
            src: preview,
            alt: manifest.filename,
            width: manifest.width,
            height: manifest.height,
          }}
          value={edits}
          onChange={setEdits}
          onApply={process}
          readOnly={busy}
          labels={{
            preview: t.preview,
            cropX: t.cropX,
            cropY: t.cropY,
            cropWidth: t.cropWidth,
            cropHeight: t.cropHeight,
            focalX: t.focalX,
            focalY: t.focalY,
            apply: t.apply,
            error: t.invalidImage,
          }}
        />
      ) : null}
      <VariantFields variants={variants} setVariants={setVariants} limits={limits} />
      {!valid ? (
        <p role="alert" className="text-sm text-destructive">
          {t.recipeInvalid}
        </p>
      ) : null}
    </ManagementDialog>
  );
}

function VariantFields({
  variants,
  setVariants,
  limits,
}: {
  variants: VariantDraft[];
  setVariants: (update: (value: VariantDraft[]) => VariantDraft[]) => void;
  limits: NonNullable<CollectionEditor['upload']>;
}) {
  const id = useId();
  const locale = useShell((value) => value.locale);
  const t = assetMessages[locale];
  function change(index: number, value: Partial<VariantDraft>) {
    setVariants((current) =>
      current.map((variant, offset) => (index === offset ? { ...variant, ...value } : variant)),
    );
  }
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-medium">{t.variants}</legend>
      {variants.map((variant, index) => (
        <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border p-3">
          <Field id={`${id}-${index}-variantName`} label={t.variantName}>
            <Input
              value={variant.name}
              onChange={(event) => change(index, { name: event.currentTarget.value })}
            />
          </Field>
          <Field id={`${id}-${index}-width`} label={t.width}>
            <Input
              type="number"
              min={1}
              max={limits.maxWidth}
              value={variant.width}
              onChange={(event) => change(index, { width: event.currentTarget.value })}
            />
          </Field>
          <Field id={`${id}-${index}-height`} label={t.height}>
            <Input
              type="number"
              min={1}
              max={limits.maxHeight}
              value={variant.height}
              onChange={(event) => change(index, { height: event.currentTarget.value })}
            />
          </Field>
          <Field id={`${id}-${index}-quality`} label={t.quality}>
            <Input
              type="number"
              min={1}
              max={100}
              value={variant.quality}
              onChange={(event) => change(index, { quality: event.currentTarget.value })}
            />
          </Field>
          <Field id={`${id}-${index}-fit`} label={t.fit}>
            <NativeSelect
              value={variant.fit}
              onChange={(event) => {
                const { value } = event.currentTarget;
                if (value === 'cover' || value === 'contain' || value === 'inside')
                  change(index, { fit: value });
              }}
            >
              <option value="inside">inside</option>
              <option value="cover">cover</option>
              <option value="contain">contain</option>
            </NativeSelect>
          </Field>
          <Field id={`${id}-${index}-format`} label={t.format}>
            <NativeSelect
              value={variant.format}
              onChange={(event) => {
                const { value } = event.currentTarget;
                if (value === 'jpeg' || value === 'png' || value === 'webp')
                  change(index, { format: value });
              }}
            >
              <option value="webp">webp</option>
              <option value="jpeg">jpeg</option>
              <option value="png">png</option>
            </NativeSelect>
          </Field>
          <Button
            variant="outline"
            onClick={() =>
              setVariants((current) => current.filter((_, offset) => offset !== index))
            }
          >
            {t.removeVariant}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={variants.length >= limits.maxVariants}
        onClick={() =>
          setVariants((current) => [
            ...current,
            { name: '', width: '', height: '', quality: '', fit: 'inside', format: 'webp' },
          ])
        }
      >
        {t.addVariant}
      </Button>
    </fieldset>
  );
}
