'use client';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { useAccessControl } from '../access-control/provider';
import { collectionScope } from './content-policy';
import { createDocumentChannel } from './document-channel';
import { readEditor } from './read-editor';
import type { EditorSnapshot } from './read-editor';
interface ChannelProps {
  initial: EditorSnapshot;
  readReady: boolean;
  onCreated: (id: string) => void;
  onArchived: () => void;
}
export function useDocumentChannel(props: ChannelProps) {
  const access = useAccessControl();
  const { initial } = props;
  const collection = initial.collection.key;
  const input = {
    can: (operation: string) =>
      props.readReady && access.can(operation, collectionScope(collection)),
    report: access.reportResult,
    load: (id: string | undefined, signal: AbortSignal) =>
      readEditor({
        collection,
        id,
        locale: initial.editor.locale,
        intent: editorIntent(id, access.can('documents.update', collectionScope(collection))),
        ...(!id && initial.upload ? { uploadId: initial.upload.id } : {}),
        signal,
      }),
    created: props.onCreated,
    archived: props.onArchived,
  };
  const [channel] = useState(() => createDocumentChannel({ initial, ...input }));
  useLayoutEffect(() => {
    channel.configure(input);
  });
  const state = useSyncExternalStore(channel.subscribe, channel.getSnapshot, channel.getSnapshot);
  useEffect(() => channel.observe(initial), [channel, initial]);
  useLayoutEffect(() => {
    channel.activate();
    return () => channel.dispose();
  }, [channel]);
  return { channel, state };
}
function editorIntent(id: string | undefined, write: boolean) {
  if (!id) return 'create';
  return write ? 'update' : 'read';
}
