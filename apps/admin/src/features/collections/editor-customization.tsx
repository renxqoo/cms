'use client';

import type { ReactNode } from 'react';
import { RegisteredCollection } from '../admin-components/renderers';
import type { CollectionComponentSlot } from '../admin-components/types';
import type { ContentEditorModel } from './use-content-editor';

export function EditorSlot({
  model,
  slot,
  children,
  disabled = false,
  onAction,
}: {
  model: ContentEditorModel;
  slot: CollectionComponentSlot;
  children?: ReactNode;
  disabled?: boolean;
  onAction?: () => void;
}) {
  const { snapshot } = model.state;
  if (!snapshot) return children;
  return (
    <RegisteredCollection
      slot={slot}
      collection={snapshot.collection}
      document={snapshot.document}
      editor={{ ...snapshot.editor, componentProps: model.state.componentProps }}
      readOnly={snapshot.editor.intent === 'read'}
      disabled={disabled}
      {...(onAction
        ? {
            onAction: () => {
              if (!disabled) onAction();
            },
          }
        : {})}
    >
      {children}
    </RegisteredCollection>
  );
}
