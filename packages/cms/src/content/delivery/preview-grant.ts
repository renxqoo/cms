import { createHash, randomUUID } from 'node:crypto';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import { collectionPredicate, ensureVisible } from '../runtime.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { ContentDeliveryOptions, DeliverySession } from './types.ts';
import type { StoredDocument } from '../model.ts';
import { assertCompletePreviewRead } from './preview-policy.ts';
export interface PreviewGrant {
  id: string;
  issuer_id: string;
  collection_id: string;
  document_id: string;
  revision_id: string;
  locale: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}
export function previewTokenHash(grant: string): string {
  if (
    !/^[A-Za-z0-9_-]{43}$/u.test(grant) ||
    Buffer.from(grant, 'base64url').toString('base64url') !== grant
  )
    fail('unauthenticated');
  return createHash('sha256').update(grant).digest('hex');
}
export async function readPreviewGrant(
  tx: DeliverySession['tx'],
  options: ContentDeliveryOptions,
  input: { grant: string; revoked?: boolean },
): Promise<PreviewGrant> {
  const result = await tx.query<PreviewGrant>(
    `SELECT id,issuer_id,collection_id,document_id,revision_id,locale,expires_at,revoked_at FROM content_preview_grants WHERE token_hash=$1 AND client_origin=$2 AND expires_at>clock_timestamp() ${input.revoked ? '' : 'AND revoked_at IS NULL'}`,
    [previewTokenHash(input.grant), new URL(options.clientOrigin).origin],
  );
  const [row] = result.rows;
  if (!row) fail('unauthenticated');
  return row;
}
async function issuerState(
  runtime: ContentRuntime,
  tx: DeliverySession['tx'],
  grant: PreviewGrant,
): Promise<ContentState> {
  const collection = await runtime.resolveCollection(tx, 'models');
  if (collection.id !== grant.collection_id || !collection.locales.supported.includes(grant.locale))
    fail('unauthenticated');
  const actor = await runtime.authorizeActor(tx, {
    actor: { id: grant.issuer_id, delegationId: null },
    operationId: 'documents.get',
    scope: { scopeKind: 'collection', collectionKey: 'models' },
  });
  if (!actor) fail('unauthenticated');
  const state: ContentState = {
    tx,
    ctx: { requestId: randomUUID(), ip: '' },
    actor,
    collection,
    operationId: 'documents.get',
    locale: grant.locale,
    mode: 'editing',
    actorAuthorization: true,
  };
  const predicate = collectionPredicate(state);
  return { ...state, ...(predicate ? { predicate } : {}) };
}
export async function assertPreviewIssuer(
  runtime: ContentRuntime,
  tx: DeliverySession['tx'],
  grant: PreviewGrant,
): Promise<StoredDocument> {
  try {
    const state = await issuerState(runtime, tx, grant);
    const document = await ensureVisible(state, { runtime, id: grant.document_id });
    const version = await runtime.store.readRevision(tx, {
      collection: 'models',
      documentId: document.id,
      versionId: grant.revision_id,
    });
    const data = await runtime.store.readRevisionData(tx, {
      collection: 'models',
      documentId: document.id,
      versionId: version.id,
      locale: grant.locale,
      fallback: [],
    });
    assertCompletePreviewRead(state, data);
    return { document, version, data };
  } catch (error) {
    if (
      error instanceof CmsError &&
      ['unauthenticated', 'forbidden', 'endpoint_unbound', 'not_found', 'invalid_scope'].includes(
        error.code,
      )
    )
      fail('unauthenticated');
    throw error;
  }
}
