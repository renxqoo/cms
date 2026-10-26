'use client';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { folderWriteConfirmed, canAdoptFolder } from './folder-intent';
import type { FolderWrite } from './folder-intent';
import { createFolderReader } from './folder-reader';
import type { FolderReaderInput } from './folder-reader';
import { useContentMutation } from './use-content-mutation';
export function useFolderRecovery(input: FolderReaderInput) {
  const mutation = useContentMutation(input.report);
  const submitted = useRef<FolderWrite | null>(null);
  const [reader] = useState(() => createFolderReader(input));
  const recovery = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useLayoutEffect(() => reader.configure(input));
  useEffect(() => () => reader.dispose(), [reader]);
  function clear() {
    mutation.clear();
    submitted.current = null;
    reader.reset();
  }
  return {
    mutation,
    recovery,
    async run(write: FolderWrite) {
      if (reader.getSnapshot().phase === 'reading' || mutation.phase !== 'idle') return null;
      submitted.current = write;
      reader.reset();
      return mutation.run(write.intent);
    },
    async verify() {
      const write = submitted.current;
      if (!write || mutation.phase === 'writing' || !(await reader.read(write.expected)))
        return false;
      if (
        mutation.phase === 'blocked' &&
        folderWriteConfirmed(write.expected, reader.getSnapshot().row)
      ) {
        clear();
        return true;
      }
      return false;
    },
    adopt(version: number, allowed: boolean) {
      const fresh = reader.getSnapshot();
      const expected = submitted.current?.expected;
      if (
        !allowed ||
        !input.canRead ||
        fresh.phase !== 'ready' ||
        !canAdoptFolder(expected, fresh.row, version)
      )
        return false;
      clear();
      return true;
    },
  };
}
