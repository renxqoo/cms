import { requestApi } from '../../api/client';
import { documentSchema } from '../../contracts/content';
import type { Document } from '../../contracts/content';
import type { ApiResult } from '../../api/result';
import { commandResponseSchema } from './write-intent';
import type { ContentFailure, DocumentChannelInput, WriteIntent } from './channel-types';
import type { EditorSnapshot } from './read-editor';
type WriteOutcome =
  | { kind: 'cancelled' }
  | { kind: 'failed'; error: ContentFailure; confirmed: boolean; target: string | undefined }
  | { kind: 'archived'; document: Document }
  | { kind: 'saved'; snapshot: EditorSnapshot; receipt: unknown; createdId: string | undefined };
interface WriteContext {
  intent: WriteIntent;
  signal: AbortSignal;
  load: DocumentChannelInput['load'];
  report: (result: ApiResult<unknown>) => void;
}
export async function performDocumentWrite(input: WriteContext): Promise<WriteOutcome> {
  const { intent, signal } = input;
  const result = await requestApi({
    operation: intent.operation,
    params: intent.params,
    ...(intent.body ? { body: intent.body } : {}),
    ...(intent.query ? { query: intent.query } : {}),
    ...(intent.key ? { idempotencyKey: intent.key } : {}),
    response: commandResponseSchema(intent.command),
    signal,
  });
  if (signal.aborted) return { kind: 'cancelled' };
  input.report(result);
  if (!result.ok) return { kind: 'failed', error: result, confirmed: false, target: undefined };
  const parsed = documentSchema.safeParse(result.data);
  if (parsed.success && intent.command.kind === 'archive')
    return { kind: 'archived', document: parsed.data };
  const target =
    parsed.success && intent.command.kind !== 'copy'
      ? parsed.data.id
      : intent.snapshot.document?.id;
  const reread = await input.load(target, signal);
  if (signal.aborted) return { kind: 'cancelled' };
  input.report(reread);
  if (!reread.ok)
    return { kind: 'failed', error: { ...reread, uncertain: true }, confirmed: true, target };
  return {
    kind: 'saved',
    snapshot: reread.data,
    receipt: result.data,
    createdId: parsed.success && !intent.snapshot.document ? parsed.data.id : undefined,
  };
}
