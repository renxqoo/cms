import { randomBytes, randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  createRunner,
  ensureVisible,
  requireAdditionalOperation,
  requireRevision,
  auditContent,
} from '../runtime.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentRow } from '../model.ts';
import type { ContentDeliveryOptions } from './types.ts';
import type { PublicPreviewTicket } from './contracts.ts';
import { previewInput, issuePreviewInput, revokeTicketInput } from './preview-input.ts';
import type { IssuePreviewInput } from './preview-input.ts';
import { previewTokenHash } from './preview-grant.ts';
import { assertCompletePreviewRead } from './preview-policy.ts';
import { text } from './source.ts';
interface IssueWork {
  runtime: ContentRuntime;
  options: ContentDeliveryOptions;
  input: IssuePreviewInput;
}
async function requirePreviewCapacity(
  state: ContentState,
  options: ContentDeliveryOptions,
): Promise<void> {
  const counts = await state.tx.query<{ total: number; issuer: number }>(
    'SELECT count(*)::int AS total,count(*) FILTER(WHERE issuer_id=$1)::int AS issuer FROM content_preview_grants WHERE revoked_at IS NULL AND expires_at>clock_timestamp()',
    [state.actor.id],
  );
  const [count] = counts.rows;
  if (
    (count?.total ?? 0) >= options.policy.previewMaxActive ||
    (count?.issuer ?? 0) >= options.policy.previewMaxActivePerIssuer
  )
    fail('capacity_exceeded');
}
async function insertTicket(
  state: ContentState,
  input: { document: DocumentRow; options: ContentDeliveryOptions },
) {
  const { document, options } = input;
  const id = randomUUID();
  const credential = randomBytes(32).toString('base64url');
  const result = await state.tx.query<{ expires_at: Date | string }>(
    `WITH stamp AS (SELECT clock_timestamp() AS now) INSERT INTO content_preview_grants(id,token_hash,issuer_id,collection_id,document_id,revision_id,locale,client_origin,created_at,expires_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,now,now+$9*interval '1 millisecond' FROM stamp RETURNING expires_at`,
    [
      id,
      previewTokenHash(credential),
      state.actor.id,
      state.collection.id,
      document.id,
      document.currentVersionId,
      state.locale,
      new URL(options.clientOrigin).origin,
      options.policy.previewTtlMs,
    ],
  );
  const expires = result.rows[0]?.expires_at;
  if (!expires) fail('internal_error');
  return { ticketId: id, expiresAt: new Date(expires).toISOString(), credential };
}
async function issue(state: ContentState, work: IssueWork): Promise<PublicPreviewTicket> {
  if (state.actor.delegation) fail('forbidden');
  const { runtime, options, input } = work;
  const reader = await requireAdditionalOperation(state, {
    runtime,
    operationId: 'documents.get',
    id: input.id,
  });
  const document = await ensureVisible(reader, { runtime, id: input.id });
  requireRevision(document, input.expectedRevision);
  const data = await runtime.store.readRevisionData(reader.tx, {
    collection: reader.collection.key,
    documentId: document.id,
    versionId: document.currentVersionId,
    locale: reader.locale,
    fallback: [],
  });
  assertCompletePreviewRead(reader, data);
  await requirePreviewCapacity(reader, options);
  const ticket = await insertTicket(reader, { document, options });
  await auditContent(state, {
    runtime,
    id: document.id,
    detail: {
      ticketId: ticket.ticketId,
      versionId: document.currentVersionId,
      locale: state.locale,
      expiresAt: ticket.expiresAt,
    },
  });
  const url = new URL('/api/content-preview', options.clientOrigin);
  url.searchParams.set('slug', text(data['slug']));
  url.searchParams.set('locale', state.locale);
  url.searchParams.set('grant', ticket.credential);
  return { ticketId: ticket.ticketId, expiresAt: ticket.expiresAt, url: url.href };
}
export function createPreviewManagement(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  const run = createRunner(runtime);
  return {
    async createPreviewTicket(ctx: RequestContext, raw: unknown): Promise<PublicPreviewTicket> {
      const input = previewInput(issuePreviewInput, raw);
      return run(
        {
          ctx,
          operationId: 'documents.createPreviewTicket',
          collection: input.collection,
          ...(input.locale ? { locale: input.locale } : {}),
        },
        (state) => issue(state, { runtime, options, input }),
      );
    },
    async revokePreviewTicket(ctx: RequestContext, raw: unknown) {
      const input = previewInput(revokeTicketInput, raw);
      return run(
        { ctx, operationId: 'documents.revokePreviewTicket', collection: input.collection },
        async (state) => {
          await requireAdditionalOperation(state, {
            runtime,
            operationId: 'documents.get',
            id: input.id,
          });
          const result = await state.tx.query(
            'UPDATE content_preview_grants SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1 AND document_id=$2 AND collection_id=$3 RETURNING id',
            [input.ticketId, input.id, state.collection.id],
          );
          if (result.rowCount !== 1) fail('not_found');
          await auditContent(state, {
            runtime,
            id: input.id,
            detail: { ticketId: input.ticketId },
          });
          return { revoked: true as const };
        },
      );
    },
  };
}
