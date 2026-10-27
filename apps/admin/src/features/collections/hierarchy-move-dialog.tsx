'use client';

import { useMemo, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { useApiQuery } from '../management-shared/query';
import { useAccessControl } from '../access-control/provider';
import { useShell } from '../../components/shell/shell-provider';
import { collectionEditorSchema } from '../../contracts/editor';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import { hierarchyMoveSchema } from '../../contracts/hierarchy';
import { FieldRenderer } from '../fields/field-renderer';
import type { FieldData } from '../fields/types';
import { referenceServices } from './reference-services';
import { useContentMutation } from './use-content-mutation';
import { hierarchyMessages } from './hierarchy-messages';

export interface HierarchyMoveProps {
  collection: Collection;
  documents: readonly Document[];
  locale: string;
  onClose: () => void;
  onChanged: () => void;
}

export function HierarchyMoveDialog(props: HierarchyMoveProps) {
  const language = useShell((state) => state.locale);
  const t = hierarchyMessages[language];
  const { reportResult } = useAccessControl();
  const [value, setValue] = useState<FieldData>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useContentMutation();
  const parentName = props.collection.hierarchy?.parentFieldName;
  const editor = useApiQuery({
    operation: 'collections.editor',
    params: { collection: props.collection.key },
    query: { intent: 'update', id: props.documents[0]?.id, locale: props.locale },
    response: collectionEditorSchema,
    enabled: props.documents.length > 0,
  });
  const services = useMemo(
    () => referenceServices([props.collection], reportResult),
    [props.collection, reportResult],
  );
  const parentNode = editor.data?.layout.find((node) => node.name === parentName);
  const parent = parentName ? value[parentName] : null;
  const ready =
    parentNode !== undefined &&
    parentNode.write !== 'denied' &&
    !(props.collection.disableBulkEdit && props.documents.length > 1);
  function submit() {
    if (!ready || !parentName || Object.keys(errors).length > 0) return;
    const parentId =
      parent &&
      typeof parent === 'object' &&
      !Array.isArray(parent) &&
      typeof parent['id'] === 'string'
        ? parent['id']
        : null;
    void mutation.run(
      {
        operation: 'hierarchy.move',
        params: { collection: props.collection.key },
        body: {
          locale: props.locale,
          parentId,
          items: props.documents.map((document) => ({
            id: document.id,
            revision: document.revision,
          })),
        },
        response: hierarchyMoveSchema,
        idempotencyKey: key,
      },
      () => {
        props.onChanged();
        props.onClose();
      },
    );
  }
  return (
    <ManagementDialog
      open
      onClose={props.onClose}
      title={t.moveSelected}
      onSubmit={submit}
      submitLabel={t.save}
      pending={mutation.pending}
      locked={mutation.locked}
      disabled={!ready || Object.keys(errors).length > 0}
      feedback={
        <>
          <ManagementFeedback error={editor.error} onRetry={editor.reload} />
          <ManagementFeedback error={mutation.error} />
        </>
      }
      actions={
        mutation.replayable ? (
          <Button onClick={mutation.retry}>{t.retry}</Button>
        ) : mutation.locked ? (
          <Button
            onClick={() => {
              props.onChanged();
              props.onClose();
            }}
          >
            {t.refresh}
          </Button>
        ) : undefined
      }
    >
      {parentNode ? (
        <FieldRenderer
          idPrefix="hierarchy-move"
          resetKey={key}
          onValidityChange={(field, error) =>
            setErrors((before) => {
              const next = { ...before };
              if (error === null)
                return Object.fromEntries(Object.entries(next).filter(([name]) => name !== field));
              next[field] = error;
              return next;
            })
          }
          layout={[parentNode]}
          value={value}
          onChange={setValue}
          locale={props.locale}
          services={services}
          readOnly={mutation.pending || mutation.locked || !ready}
          richTextNodes={[]}
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={mutation.pending || mutation.locked}
        onClick={() => parentName && setValue({ [parentName]: null })}
      >
        {t.root}
      </Button>
    </ManagementDialog>
  );
}
