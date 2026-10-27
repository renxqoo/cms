import type { CSSProperties } from 'react';
import type { EditorNode } from '../../contracts/editor';
export function fieldWidthStyle(
  width: EditorNode['width'],
): (CSSProperties & { '--field-width': string }) | undefined {
  return width === undefined
    ? undefined
    : { '--field-width': typeof width === 'number' ? `${width}px` : width };
}
