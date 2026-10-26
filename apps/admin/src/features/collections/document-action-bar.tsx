'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Switch } from '@new-cms/ui/forms';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@new-cms/ui/overlays';
import { useAccessControl } from '../access-control/provider';
import { commandExecutable } from './channel-policy';
import { actionAllowed, documentDirty } from './channel-data';
import { commandOperation } from './write-intent';
import { collectionScope } from './content-policy';
import type { DocumentChannel, DocumentChannelState } from './channel-types';
import type { ContentMessages } from './content-messages';
interface BarCommand {
  kind: 'save' | 'copy' | 'archive' | 'publish' | 'unpublish';
}
interface ActionBarProps {
  channel: DocumentChannel;
  state: DocumentChannelState;
  readReady: boolean;
  messages: ContentMessages;
}
export function DocumentActionBar({ channel, state, readReady, messages: t }: ActionBarProps) {
  const access = useAccessControl();
  const [confirm, setConfirm] = useState<BarCommand | null>(null);
  const can = (operation: string) =>
    readReady && access.can(operation, collectionScope(state.snapshot.collection.key));
  const commands = barCommands(state).filter((command) =>
    actionAllowed(state, commandOperation(state, command), can),
  );
  const auto =
    state.snapshot.document !== null &&
    state.snapshot.collection.capabilities.autosave &&
    actionAllowed(state, 'documents.autosave', can);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {commands.map((command) => (
          <Button
            key={command.kind}
            variant={barVariant(command)}
            disabled={barBlocked(state, command)}
            busy={command.kind === 'save' && state.phase === 'writing'}
            onClick={() =>
              command.kind === 'save' ? void channel.execute(command) : setConfirm(command)
            }
          >
            {t[command.kind]}
          </Button>
        ))}
        {auto ? (
          <Switch
            label={t.autosave}
            checked={state.autosave}
            disabled={state.phase === 'blocked'}
            onCheckedChange={(value) => channel.setAutosave(value)}
          />
        ) : null}
      </div>
      {documentDirty(state) && state.snapshot.document ? (
        <p className="text-xs text-muted-foreground">{t.cleanFirst}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t.autosaveHint}</p>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent closeLabel={t.close}>
          <DialogHeader>
            <DialogTitle>{t.confirmTitle}</DialogTitle>
            <DialogDescription>
              {confirm?.kind === 'archive' ? t.archiveHint : t.conditional}
            </DialogDescription>
          </DialogHeader>
          <p>{confirm ? t[confirm.kind] : null}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              {t.cancel}
            </Button>
            <Button
              disabled={
                confirm === null ||
                barBlocked(state, confirm) ||
                !actionAllowed(state, commandOperation(state, confirm), can)
              }
              onClick={() => {
                if (confirm) void channel.execute(confirm);
                setConfirm(null);
              }}
            >
              {t.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function barCommands(state: DocumentChannelState): BarCommand[] {
  const commands: BarCommand[] = [{ kind: 'save' }];
  const doc = state.snapshot.document;
  if (!doc) return commands;
  commands.push({ kind: 'copy' }, { kind: 'archive' });
  if (state.snapshot.collection.capabilities.publication) {
    commands.push({ kind: 'publish' });
    if (doc.publishedVersionId) commands.push({ kind: 'unpublish' });
  }
  return commands;
}
function barVariant(command: BarCommand) {
  if (command.kind === 'archive') return 'destructive';
  return command.kind === 'save' ? 'default' : 'outline';
}
function barBlocked(state: DocumentChannelState, command: BarCommand) {
  return !commandExecutable(state, command, true);
}
