import { randomUUID } from 'node:crypto';
import { budgetedExecutor } from '../runtime.ts';
import { appendAudit } from '@new-cms/cms/audit/composition';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { ContentRuntime } from '../types.ts';
import type { ContentDeliveryOptions } from './types.ts';
import { readPreviewGrant, assertPreviewIssuer } from './preview-grant.ts';
import { previewInput, revokeGrantInput } from './preview-input.ts';
import { createPreviewReader } from './preview-read.ts';
import { createPreviewManagement } from './preview-management.ts';
export function createPreviewApi(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  return {
    ...createPreviewManagement(runtime, options),
    ...createPreviewReader(runtime, options),
    async revokePreview(raw: unknown, signal?: AbortSignal) {
      const input = previewInput(revokeGrantInput, raw);
      return securityTransaction(runtime.database, runtime.policy, {
        mode: 'shared',
        ...(signal ? { signal } : {}),
        async work(executor) {
          const tx = budgetedExecutor(executor, options.policy.maxSqlQueries);
          const grant = await readPreviewGrant(tx, options, { grant: input.grant, revoked: true });
          await assertPreviewIssuer(runtime, tx, { grant, ...(signal ? { signal } : {}) });
          await tx.query(
            'UPDATE content_preview_grants SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1',
            [grant.id],
          );
          await appendAudit(
            tx,
            {
              actorKind: 'admin',
              actorId: grant.issuer_id,
              operationId: 'previewContent.revoke',
              targetType: 'content:models',
              targetId: grant.document_id,
              requestId: randomUUID(),
              detail: { ticketId: grant.id },
            },
            runtime.policy,
          );
          return { revoked: true as const };
        },
      });
    },
  };
}
export async function prunePreviewGrants(
  runtime: ContentRuntime,
  signal: AbortSignal,
): Promise<void> {
  await runtime.database.transaction(async (tx) => {
    await tx.query(
      'DELETE FROM content_preview_grants WHERE id IN(SELECT id FROM content_preview_grants WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED)',
      [runtime.policy.cleanupBatchSize],
    );
  }, signal);
}
