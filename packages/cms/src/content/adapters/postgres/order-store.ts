import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import { scopedOrderVersion } from './order-state.ts';
import type { OrderScope, OrderState } from './order-state.ts';

export async function orderStorageReady(tx: SqlExecutor): Promise<boolean> {
  const ready = await tx.query<{ ready: boolean }>(
    `SELECT (SELECT count(*)=2 FROM cms_migrations WHERE name IN('0019_document_order.sql','0023_join_order_scopes.sql'))
      AND (SELECT count(*)=2 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace f ON f.oid=p.pronamespace
        WHERE n.nspname=current_schema() AND ((c.relname='content_documents' AND t.tgname='content_documents_track_order' AND t.tgtype=13)
          OR (c.relname='content_schema_control' AND t.tgname='content_schema_track_order' AND t.tgtype=5))
          AND NOT t.tgisinternal AND t.tgenabled IN ('O','A') AND t.tgqual IS NULL AND t.tgnargs=0
          AND f.nspname=current_schema() AND p.proname='cms_track_document_order' AND p.pronargs=0 AND p.prorettype='trigger'::regtype
          AND NOT p.prosecdef AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
      AND NOT EXISTS(SELECT 1 FROM content_schema_control c LEFT JOIN content_order_control o ON o.collection_id=c.collection_id AND o.scope_key='' WHERE o.collection_id IS NULL)
      AND EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid='content_document_order'::regclass AND t.tgname='content_document_order_identity_guard' AND t.tgtype=19 AND t.tgenabled IN('O','A') AND NOT t.tgisinternal AND t.tgqual IS NULL AND t.tgnargs=0 AND n.nspname=current_schema() AND p.proname='cms_guard_document_order_identity' AND NOT p.prosecdef AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) AS ready`,
  );
  if (ready.rows[0]?.ready !== true) return false;
  const constraints = await tx.query<{
    ready: boolean;
  }>(`SELECT (SELECT pg_get_constraintdef(oid)='PRIMARY KEY (collection_id, scope_key)' FROM pg_constraint WHERE conrelid='content_order_control'::regclass AND contype='p')
    AND (SELECT pg_get_constraintdef(oid)='PRIMARY KEY (document_id, scope_key)' FROM pg_constraint WHERE conrelid='content_document_order'::regclass AND contype='p')
    AND (SELECT count(*)=3 FROM pg_constraint WHERE conrelid='content_document_order'::regclass AND conname IN('content_document_order_position_uq','content_document_order_initial_uq','content_document_order_initial_check') AND convalidated) AS ready`);
  if (constraints.rows[0]?.ready !== true) return false;
  await tx.query(
    'SELECT collection_id,scope_key,version,last_position FROM content_order_control LIMIT 0',
  );
  await tx.query(
    'SELECT document_id,collection_id,scope_key,position,initial_position FROM content_document_order LIMIT 0',
  );
  return true;
}

function dyadicStep(count: number): string {
  let slots = 1;
  let scale = 0;
  let numerator = 1n;
  while (slots <= count) {
    slots *= 2;
    scale += 1;
    numerator *= 5n;
  }
  return `0.${numerator.toString().padStart(scale, '0')}`;
}

export async function reorderDocuments(
  tx: SqlExecutor,
  input: OrderScope & {
    ids: readonly string[];
    targetId: string;
    position: 'before' | 'after';
    state: OrderState;
    maxKeyBytes: number;
  },
): Promise<string> {
  const bounds = await tx.query<{ lower: string; upper: string }>(
    `WITH positions AS MATERIALIZED(SELECT b.document_id,coalesce(s.position,b.initial_position) AS position FROM content_document_order b LEFT JOIN content_document_order s ON s.document_id=b.document_id AND s.scope_key=$2 WHERE b.collection_id=$1 AND b.scope_key='')
     SELECT CASE WHEN $5 THEN coalesce((SELECT x.position FROM positions x WHERE x.document_id<>ALL($4::uuid[]) AND x.position<t.position ORDER BY x.position DESC LIMIT 1),t.position-1) ELSE t.position END::text AS lower,
      CASE WHEN $5 THEN t.position ELSE coalesce((SELECT x.position FROM positions x WHERE x.document_id<>ALL($4::uuid[]) AND x.position>t.position ORDER BY x.position LIMIT 1),t.position+1) END::text AS upper
     FROM positions t WHERE t.document_id=$3`,
    [input.collection, input.scopeKey, input.targetId, input.ids, input.position === 'before'],
  );
  const [range] = bounds.rows;
  if (!range) fail('not_found');
  const changed = await tx.query(
    `WITH positions AS MATERIALIZED(SELECT id,($2::numeric+($3::numeric-$2::numeric)*$4::numeric*ordinality)::text AS key FROM unnest($1::uuid[]) WITH ORDINALITY m(id,ordinality))
     INSERT INTO content_document_order(document_id,collection_id,scope_key,position,initial_position)
     SELECT p.id,$5,$7,p.key::numeric,CASE WHEN $7='' THEN b.initial_position ELSE NULL END FROM positions p JOIN content_document_order b ON b.document_id=p.id AND b.scope_key=''
     WHERE (SELECT bool_and(octet_length(key)<=$6) FROM positions)
     ON CONFLICT(document_id,scope_key) DO UPDATE SET position=excluded.position`,
    [
      input.ids,
      range.lower,
      range.upper,
      dyadicStep(input.ids.length),
      input.collection,
      input.maxKeyBytes,
      input.scopeKey,
    ],
  );
  if (changed.rowCount !== input.ids.length) fail('capacity_exceeded');
  return advanceOrder(tx, { ...input, upper: range.upper });
}

async function advanceOrder(
  tx: SqlExecutor,
  input: OrderScope & { state: OrderState; upper: string },
): Promise<string> {
  const base = randomUUID();
  const scope = input.scopeKey === '' ? null : randomUUID();
  if (scope !== null) {
    const result = await tx.query(
      `INSERT INTO content_order_control(collection_id,scope_key,version,last_position) VALUES($1,$2,$3,greatest(0,ceil($4::numeric)))
       ON CONFLICT(collection_id,scope_key) DO UPDATE SET version=excluded.version,last_position=greatest(content_order_control.last_position,excluded.last_position) WHERE content_order_control.version=$5`,
      [input.collection, input.scopeKey, scope, input.upper, input.state.scopeVersion],
    );
    if (result.rowCount !== 1) fail('version_conflict');
  }
  const updated = await tx.query(
    `UPDATE content_order_control SET version=$3,last_position=greatest(last_position,ceil($4::numeric)) WHERE collection_id=$1 AND scope_key='' AND version=$2`,
    [input.collection, input.state.baseVersion, base, input.upper],
  );
  if (updated.rowCount !== 1) fail('version_conflict');
  return scopedOrderVersion(base, scope, input.scopeKey);
}
