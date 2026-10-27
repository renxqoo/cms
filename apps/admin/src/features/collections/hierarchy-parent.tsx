'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { useShell } from '../../components/shell/shell-provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { FieldRenderer } from '../fields/field-renderer';
import type { ContentEditorModel } from './use-content-editor';
import { hierarchyMessages } from './hierarchy-messages';

export function HierarchyParentEditor({ model }: { model: ContentEditorModel }) {
  const [open, setOpen] = useState(false);
  const language = useShell((state) => state.locale);
  const t = hierarchyMessages[language];
  const { snapshot } = model.state;
  const hierarchy = snapshot?.collection.hierarchy;
  const node = snapshot?.editor.layout.find((value) => value.name === hierarchy?.parentFieldName);
  if (!snapshot || !hierarchy?.useHeaderButton || !node) return null;
  const writable =
    node.write !== 'denied' &&
    model.allowed(snapshot.document ? 'documents.update' : 'documents.create') &&
    model.props.intent !== 'read' &&
    model.state.phase === 'ready';
  return (
    <>
      <Button variant="outline" disabled={!writable || model.busy} onClick={() => setOpen(true)}>
        {t.parentEdit}
      </Button>
      {open ? (
        <ManagementDialog
          open
          title={t.parentEdit}
          onClose={() => setOpen(false)}
          onSubmit={() => setOpen(false)}
          submitLabel={t.done}
        >
          <FieldRenderer
            idPrefix="hierarchy-parent"
            resetKey={`${model.state.resetEpoch}:${snapshot.editor.locale}`}
            onValidityChange={model.controller.validity}
            layout={[node]}
            value={model.state.value}
            onChange={model.controller.change}
            locale={snapshot.editor.locale}
            services={model.services}
            readOnly={!writable || model.busy}
            richTextNodes={[]}
          />
        </ManagementDialog>
      ) : null}
    </>
  );
}
