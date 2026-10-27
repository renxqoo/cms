'use client';

import { useMemo } from 'react';
import type { ApiResult } from '../../api/result';
import type { Collection } from '../../contracts/content';
import type { FieldData } from '../fields/types';
import { ReferenceMediaPreview } from '../assets/document-media';
import type { EditorSnapshot } from './editor-read';
import { referenceServices } from './reference-services';
import { DocumentJoin } from './document-join';
import type { FieldServices } from '../fields/types';

export function useEditorReferences(input: {
  snapshot: EditorSnapshot | null;
  data: FieldData;
  collections: readonly Collection[];
  report: (result: ApiResult<unknown>) => void;
}) {
  const { snapshot, data, collections, report } = input;
  return useMemo(
    () => ({
      ...referenceServices(collections, report, snapshot ? { snapshot, data } : undefined),
      renderJoin: ((props) =>
        snapshot ? (
          <DocumentJoin
            key={JSON.stringify([
              snapshot.collection.key,
              snapshot.document?.id,
              snapshot.editor.locale,
              snapshot.editor.mode,
              snapshot.editor.intent,
              props.node.id,
              props.location.sourcePath,
            ])}
            {...props}
            snapshot={snapshot}
            collections={collections}
          />
        ) : null) satisfies NonNullable<FieldServices['renderJoin']>,
      renderPreview: (value: {
        reference: { collection: string; id: string };
        sourcePath: string;
      }) =>
        snapshot?.document ? (
          <ReferenceMediaPreview
            document={snapshot.document}
            reference={value.reference}
            sourcePath={value.sourcePath}
            locale={snapshot.editor.locale}
            mode={snapshot.editor.mode}
            fallback={snapshot.editor.fallback}
          />
        ) : null,
    }),
    [snapshot, data, collections, report],
  );
}
