'use client';

import { useId } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input } from '@new-cms/ui/forms';
import { safeResourceUrl } from './safe-url';

export interface ImageEdits {
  crop: { x: number; y: number; width: number; height: number };
  focalPoint: { x: number; y: number };
}

export interface AppliedImageEdits extends ImageEdits {
  pixelWidth: number;
  pixelHeight: number;
}

export interface ImageAdjustmentLabels {
  preview: string;
  cropX: string;
  cropY: string;
  cropWidth: string;
  cropHeight: string;
  focalX: string;
  focalY: string;
  apply: string;
  error: string;
}

interface ImageInfo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface ImageAdjustmentsProps {
  image: ImageInfo;
  value: ImageEdits;
  labels: ImageAdjustmentLabels;
  onChange(this: void, value: ImageEdits): void;
  onApply(this: void, value: AppliedImageEdits): void;
  readOnly?: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validCrop(image: ImageInfo, crop: ImageEdits['crop']): boolean {
  return (
    Object.values(crop).every(Number.isFinite) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width >= 1 / image.width &&
    crop.height >= 1 / image.height &&
    crop.x + crop.width <= 1 &&
    crop.y + crop.height <= 1
  );
}

function validImage(image: ImageInfo, value: ImageEdits): boolean {
  return (
    Number.isSafeInteger(image.width) &&
    Number.isSafeInteger(image.height) &&
    image.width > 0 &&
    image.height > 0 &&
    validCrop(image, value.crop) &&
    Object.values(value.focalPoint).every(
      (coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1,
    )
  );
}

function cropChange(input: {
  field: keyof ImageEdits['crop'];
  next: number;
  value: ImageEdits;
  image: ImageInfo;
}): ImageEdits {
  const { field, next, value, image } = input;
  const crop = { ...value.crop };
  switch (field) {
    case 'x':
      crop.x = clamp(next, 0, 1 - crop.width);
      break;
    case 'y':
      crop.y = clamp(next, 0, 1 - crop.height);
      break;
    case 'width':
      crop.width = clamp(next, 1 / image.width, 1 - crop.x);
      break;
    case 'height':
      crop.height = clamp(next, 1 / image.height, 1 - crop.y);
      break;
  }
  return { ...value, crop };
}

function AdjustmentFields({
  image,
  value,
  labels,
  onChange,
  readOnly,
}: Omit<ImageAdjustmentsProps, 'onApply'>) {
  const id = useId();
  const cropFields = [
    ['x', labels.cropX],
    ['y', labels.cropY],
    ['width', labels.cropWidth],
    ['height', labels.cropHeight],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cropFields.map(([field, label]) => (
        <Field id={`${id}-${field}`} label={label} key={field}>
          <Input
            type="number"
            min={0}
            max={1}
            step="any"
            value={value.crop[field]}
            readOnly={readOnly}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (!readOnly && Number.isFinite(next))
                onChange(cropChange({ field, next, value, image }));
            }}
          />
        </Field>
      ))}
      {(['x', 'y'] as const).map((field) => (
        <Field
          id={`${id}-focal-${field}`}
          label={field === 'x' ? labels.focalX : labels.focalY}
          key={field}
        >
          <Input
            type="number"
            min={0}
            max={1}
            step="any"
            value={value.focalPoint[field]}
            readOnly={readOnly}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (!readOnly && Number.isFinite(next))
                onChange({
                  ...value,
                  focalPoint: { ...value.focalPoint, [field]: clamp(next, 0, 1) },
                });
            }}
          />
        </Field>
      ))}
    </div>
  );
}

function ImagePreview({
  image,
  value,
  labels,
  onChange,
  readOnly,
}: Omit<ImageAdjustmentsProps, 'onApply'>) {
  function point(event: PointerEvent<HTMLDivElement>) {
    if (readOnly) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    onChange({
      ...value,
      focalPoint: {
        x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
      },
    });
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (readOnly || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
      return;
    event.preventDefault();
    const x =
      value.focalPoint.x +
      (event.key === 'ArrowLeft'
        ? -1 / image.width
        : event.key === 'ArrowRight'
          ? 1 / image.width
          : 0);
    const y =
      value.focalPoint.y +
      (event.key === 'ArrowUp'
        ? -1 / image.height
        : event.key === 'ArrowDown'
          ? 1 / image.height
          : 0);
    onChange({ ...value, focalPoint: { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } });
  }
  return (
    <div
      role="group"
      aria-label={labels.preview}
      tabIndex={readOnly ? -1 : 0}
      className="relative overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onPointerDown={point}
      onKeyDown={key}
    >
      <img src={image.src} alt={image.alt} className="block h-auto w-full" draggable={false} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_#0005]"
        style={{
          left: `${value.crop.x * 100}%`,
          top: `${value.crop.y * 100}%`,
          width: `${value.crop.width * 100}%`,
          height: `${value.crop.height * 100}%`,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/60 shadow"
        style={{ left: `${value.focalPoint.x * 100}%`, top: `${value.focalPoint.y * 100}%` }}
      />
    </div>
  );
}

export function ImageAdjustments(props: ImageAdjustmentsProps) {
  const src = safeResourceUrl(props.image.src, true);
  const valid = src !== null && validImage(props.image, props.value);
  return (
    <div className="space-y-4">
      {valid ? (
        <ImagePreview {...props} image={{ ...props.image, src: src ?? '' }} />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {props.labels.error}
        </p>
      )}
      {valid ? <AdjustmentFields {...props} /> : null}
      <Button
        disabled={!valid || props.readOnly}
        onClick={() =>
          props.onApply({
            ...props.value,
            pixelWidth: Math.max(1, Math.round(props.value.crop.width * props.image.width)),
            pixelHeight: Math.max(1, Math.round(props.value.crop.height * props.image.height)),
          })
        }
      >
        {props.labels.apply}
      </Button>
    </div>
  );
}
