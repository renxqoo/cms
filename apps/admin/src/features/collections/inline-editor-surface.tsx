'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import {
  Drawer,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@new-cms/ui/overlays';
import type { UnsavedChangesLabels } from '../../components/cms/unsaved-changes';

interface Props {
  title: string;
  dirty: boolean;
  busy: boolean;
  onClose: () => void;
  labels: UnsavedChangesLabels;
  children: ReactNode;
}
export function InlineEditorSurface(props: Props) {
  const [confirm, setConfirm] = useState(false);
  function close() {
    if (props.busy) return;
    if (props.dirty) setConfirm(true);
    else props.onClose();
  }
  return (
    <>
      <Drawer
        open
        title={props.title}
        closeLabel={props.labels.close}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <div className="min-w-0 space-y-4">{props.children}</div>
      </Drawer>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent closeLabel={props.labels.close}>
          <DialogHeader>
            <DialogTitle>{props.labels.title}</DialogTitle>
            <DialogDescription>{props.labels.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {props.labels.cancel}
            </Button>
            <Button variant="destructive" onClick={props.onClose}>
              {props.labels.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
