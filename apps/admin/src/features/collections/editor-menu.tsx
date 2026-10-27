'use client';

import { CopyIcon, CalendarClockIcon, EllipsisIcon, Trash2Icon, Undo2Icon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@new-cms/ui/overlays';
import { EditorSlot } from './editor-customization';
import { CopyLocaleMenuItem } from './copy-locale-dialog';
import type { DocumentActionProps } from './editor-controls';
import type { ContentEditorModel } from './use-content-editor';

export function DocumentMenu({ model, confirm, schedule, copy, copyLocale }: DocumentActionProps) {
  const { t } = model;
  const actions = menuActions(model);
  const { blocked, unpublish, copyable, localeCopyable, schedulable, archivable } = actions;
  if (
    ![unpublish, copyable, localeCopyable, schedulable, archivable, actions.customItems].some(
      Boolean,
    )
  )
    return null;
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="icon" aria-label={t.moreActions} />}>
        <EllipsisIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuContent>
        <EditorSlot model={model} slot="editMenuItems" />
        {unpublish ? (
          <EditorSlot
            model={model}
            slot="UnpublishButton"
            disabled={blocked}
            onAction={() => confirm('unpublish')}
          >
            <MenuItem disabled={blocked} onClick={() => confirm('unpublish')}>
              <Undo2Icon aria-hidden="true" />
              {t.unpublish}
            </MenuItem>
          </EditorSlot>
        ) : null}
        {copyable ? (
          <MenuItem disabled={blocked} onClick={copy}>
            <CopyIcon aria-hidden="true" />
            {t.copy}
          </MenuItem>
        ) : null}
        {localeCopyable ? <CopyLocaleMenuItem disabled={blocked} onClick={copyLocale} /> : null}
        {schedulable ? (
          <MenuItem disabled={blocked} onClick={schedule}>
            <CalendarClockIcon aria-hidden="true" />
            {t.schedule}
          </MenuItem>
        ) : null}
        {archivable ? (
          <>
            <MenuSeparator />
            <MenuItem tone="destructive" disabled={blocked} onClick={() => confirm('archive')}>
              <Trash2Icon aria-hidden="true" />
              {t.archive}
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

function menuActions(model: ContentEditorModel) {
  const {
    state: { snapshot },
    busy,
    dirty,
    allowed,
  } = model;
  return {
    blocked: busy || dirty,
    unpublish: Boolean(snapshot?.document?.publishedVersionId) && allowed('documents.unpublish'),
    copyable: allowed('documents.copy'),
    localeCopyable: canCopyLocale(model),
    schedulable:
      snapshot?.collection.capabilities.schedules &&
      allowed('content.schedulePublication') &&
      model.canReadJob,
    archivable: allowed('documents.archive') && model.canReadList,
    customItems: snapshot?.collection.admin?.components?.editMenuItems,
  };
}

function canCopyLocale(model: ContentEditorModel): boolean {
  const { snapshot } = model.state;
  return (
    model.allowed('documents.copyLocale') &&
    !snapshot?.collection.admin?.disableCopyToLocale &&
    (snapshot?.editor.locales.supported.length ?? 0) > 1
  );
}
