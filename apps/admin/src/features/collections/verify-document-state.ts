import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { documentListSchema } from '../../contracts/content';
import type { Document } from '../../contracts/content';
import type { DocumentChannelInput, DocumentChannelState, WriteIntent } from './channel-types';
import type { EditorSnapshot } from './read-editor';
import { documentDirty } from './channel-data';
import { intentMatches } from './verify-intent';
export type DocumentVerification =
  | { kind: 'snapshot'; snapshot: EditorSnapshot; matches: boolean; createdId: string | undefined }
  | { kind: 'archived'; document: Document };
interface VerificationInput {
  state: DocumentChannelState;
  intent: WriteIntent | null;
  confirmedWrite: boolean;
  target: string;
  signal: AbortSignal;
  load: DocumentChannelInput['load'];
  can: DocumentChannelInput['can'];
}
export async function verifyDocumentState(
  input: VerificationInput,
): Promise<ApiResult<DocumentVerification>> {
  if (input.intent?.command.kind === 'archive') {
    const trash = await readArchived(input);
    if (!trash.ok) return trash;
    if (trash.data) return { ...trash, data: { kind: 'archived', document: trash.data } };
  }
  const result = await input.load(input.target, input.signal);
  if (!result.ok) return result;
  const matches =
    input.confirmedWrite ||
    (!input.intent && !documentDirty(input.state)) ||
    intentMatches(input.intent, result.data);
  const createdId =
    matches && input.intent && !input.intent.snapshot.document ? input.target : undefined;
  return { ...result, data: { kind: 'snapshot', snapshot: result.data, matches, createdId } };
}
async function readArchived(input: VerificationInput): Promise<ApiResult<Document | null>> {
  if (!input.can('documents.list')) return failure('forbidden', 403);
  const result = await requestApi({
    operation: 'documents.list',
    params: { collection: input.state.snapshot.collection.key },
    query: {
      mode: 'editing',
      locale: input.state.snapshot.editor.locale,
      fallback: [],
      depth: 0,
      trashed: true,
      page: 1,
      pageSize: 1,
      where: { field: 'id', operator: 'eq', value: input.target },
    },
    response: documentListSchema,
    signal: input.signal,
  });
  if (!result.ok) return result;
  const document =
    result.data.rows.find((row) => row.id === input.target && row.trashedAt !== null) ?? null;
  return { ...result, data: document };
}
