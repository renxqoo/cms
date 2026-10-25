'use client';

import { RelationshipInput } from './relationship-input';
import type { RelationshipInputProps } from './relationship-input';
import { Dropzone } from './dropzone';
import type { DropzoneLabels, FileLimits, FileRejection } from './dropzone';

export type UploadInputProps = RelationshipInputProps & {
  allowCreate: boolean;
  displayPreview: boolean;
  fileLimits: FileLimits;
  dropzoneLabels: DropzoneLabels;
  onFiles?(this: void, files: File[]): void;
  onReject?(this: void, rejections: FileRejection[]): void;
};

export function UploadInput({
  allowCreate,
  fileLimits,
  dropzoneLabels,
  onFiles,
  onReject,
  onCreate,
  ...relationship
}: UploadInputProps) {
  return (
    <div className="space-y-3">
      <RelationshipInput {...relationship} {...(allowCreate && onCreate ? { onCreate } : {})} />
      {allowCreate && onFiles && !relationship.readOnly ? (
        <Dropzone
          limits={fileLimits}
          labels={dropzoneLabels}
          onFiles={onFiles}
          onReject={(rejections) => onReject?.(rejections)}
        />
      ) : null}
    </div>
  );
}
