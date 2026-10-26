import type { ApiResult } from '../../api/result';
import type { OperationId } from '../../contracts/operations';
import type { FieldData } from '../fields/types';
import type { AssetWriteKind, AssetWriteLease } from '../assets/document-asset-types';
import type { EditorSnapshot } from './read-editor';

export type ContentFailure = Extract<ApiResult<unknown>, { ok: false }>;
export type DocumentCommand =
  | { kind: 'save' | 'autosave' | 'publish' | 'unpublish' | 'archive' | 'copy' }
  | { kind: 'restoreVersion'; versionId: string }
  | { kind: 'move'; folderId: string | null }
  | { kind: 'schedule'; versionId: string; executeAt: string }
  | { kind: 'cancelSchedule'; scheduleId: string };
export interface DocumentChannelState {
  snapshot: EditorSnapshot;
  draft: FieldData;
  generation: number;
  completion: number;
  reset: number;
  phase: 'idle' | 'writing' | 'blocked' | 'checking';
  pending:
    | {
        source: 'document';
        operation: OperationId;
        kind: DocumentCommand['kind'];
        retryable: boolean;
      }
    | { source: 'asset'; kind: AssetWriteKind }
    | null;
  error: ContentFailure | null;
  inspectionError: ContentFailure | null;
  remote: EditorSnapshot | null;
  invalid: Readonly<Record<string, string>>;
  autosave: boolean;
  uploading: boolean;
  success: boolean;
  receipt: unknown;
}
export interface DocumentChannelInput {
  initial: EditorSnapshot;
  can: (operation: string) => boolean;
  report: (result: ApiResult<unknown>) => void;
  load: (id: string | undefined, signal: AbortSignal) => Promise<ApiResult<EditorSnapshot>>;
  created: (id: string) => void;
  archived: () => void;
}
export interface WriteIntent {
  operation: OperationId;
  command: DocumentCommand;
  params: Readonly<Record<string, string>>;
  body?: Readonly<Record<string, unknown>> | undefined;
  query?: Readonly<Record<string, unknown>> | undefined;
  key?: string | undefined;
  generation: number;
  draft: FieldData;
  snapshot: EditorSnapshot;
}
export interface DocumentChannel {
  getSnapshot: () => DocumentChannelState;
  subscribe: (listener: () => void) => () => void;
  edit: (draft: FieldData) => void;
  observe: (snapshot: EditorSnapshot) => void;
  configure: (input: Omit<DocumentChannelInput, 'initial'>) => void;
  validity: (identity: string, error: string | null) => void;
  setAutosave: (enabled: boolean) => void;
  setUploadActivity: (active: boolean) => void;
  selectUpload: (id: string) => Promise<void>;
  clearUpload: (id: string) => void;
  execute: (command: DocumentCommand) => Promise<void>;
  retry: () => Promise<void>;
  inspect: () => Promise<void>;
  rebase: (discard: boolean) => void;
  beginAsset: (kind: AssetWriteKind) => AssetWriteLease | null;
  activate: () => void;
  dispose: () => void;
}
