import { projectDocument } from '../documents/project-document.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  auditContent,
  createRunner,
  ensureVisible,
  parse,
  requireRevision,
  requireAdditionalOperation,
} from '../runtime.ts';
import { allRevisionReferences, currentData } from './revision-data.ts';
import { snapshotPatch } from './snapshot-patch.ts';
import { replaceAtPath, valueAtPath } from './data-path.ts';
import { saveInTransaction } from './save-document.ts';
import { targetState } from './relation-scopes.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';
import type { InboundReference } from '../adapters/postgres/store-contract.ts';
import type { DocumentRow } from '../model.ts';

interface ArchiveNode {
  state: ContentState;
  document: DocumentRow;
  incoming: InboundReference[];
  archive: boolean;
}

async function archiveIncoming(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string },
) {
  const maximum = Math.min(
    input.runtime.workPolicy.maxBatchItems,
    Math.max(input.runtime.limits.maxArrayItems, input.runtime.limits.maxExpandNodes),
  );
  const references = await input.runtime.store.inboundReferences(state.tx, {
    collection: state.collection.key,
    id: input.id,
    active: true,
    excludeDocumentId: input.id,
    limit: maximum + 1,
  });
  if (references.length > maximum) fail('capacity_exceeded');
  return references;
}

async function archiveGraph(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string },
): Promise<Map<string, ArchiveNode>> {
  const nodes = new Map<string, ArchiveNode>();
  const pending = [{ state, id: input.id }];
  while (pending.length > 0) {
    const next = pending.shift();
    if (!next || nodes.get(next.id)?.archive === true) continue;
    if (nodes.size >= input.runtime.workPolicy.maxBatchItems) fail('capacity_exceeded');
    const document = await ensureVisible(next.state, {
      runtime: input.runtime,
      id: next.id,
      trashed: true,
    });
    const incoming = await archiveIncoming(next.state, { runtime: input.runtime, id: next.id });
    rejectRestrictive(incoming);
    nodes.set(next.id, { state: next.state, document, incoming, archive: true });
    for (const reference of incoming) {
      const target = await targetState(next.state, {
        runtime: input.runtime,
        collection: reference.sourceCollection,
      });
      const operationId =
        reference.onDelete === 'cascade' ? 'documents.archive' : 'documents.update';
      const authorized = await requireAdditionalOperation(target, {
        runtime: input.runtime,
        operationId,
        id: reference.sourceDocumentId,
      });
      if (reference.onDelete === 'cascade')
        pending.push({ state: authorized, id: reference.sourceDocumentId });
      else if (!nodes.has(reference.sourceDocumentId))
        nodes.set(reference.sourceDocumentId, {
          state: authorized,
          document: await ensureVisible(authorized, {
            runtime: input.runtime,
            id: reference.sourceDocumentId,
          }),
          incoming: [],
          archive: false,
        });
    }
  }
  return nodes;
}

async function lockArchiveGraph(
  runtime: ContentRuntime,
  nodes: Map<string, ArchiveNode>,
): Promise<void> {
  const ids = [...nodes.keys()];
  for (const node of nodes.values()) {
    const references = await allRevisionReferences(node.state, {
      runtime,
      document: node.document,
    });
    ids.push(...references.map((reference) => reference.id));
  }
  const first = nodes.values().next().value;
  if (!first) return;
  await first.state.tx.query(
    "SELECT id FROM content_jobs WHERE document_id=ANY($1::uuid[]) AND action='publication' AND status IN('queued','running') ORDER BY id FOR UPDATE",
    [[...nodes.keys()].toSorted()],
  );
  await runtime.store.lockDocuments(first.state.tx, { ids: [...new Set(ids)].toSorted() });
  for (const node of nodes.values()) {
    const current = await ensureVisible(node.state, {
      runtime,
      id: node.document.id,
      trashed: true,
    });
    requireRevision(current, node.document.revision);
  }
}

function removeReference(data: DocumentData, path: string, targetId: string): boolean {
  const value = valueAtPath(data, path);
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value['id'] !== targetId
  )
    return false;
  const segments = path.split('.');
  const index = segments.pop();
  const parent = valueAtPath(data, segments.join('.'));
  if (Array.isArray(parent) && index !== undefined && /^\d+$/.test(index))
    parent.splice(Number(index), 1);
  else replaceAtPath(data, path, null);
  return true;
}

async function nullifySource(
  node: ArchiveNode,
  input: { runtime: ContentRuntime; targetId: string; reference: InboundReference },
): Promise<void> {
  const separator = input.reference.path.indexOf(':');
  const locale = separator >= 0 ? input.reference.path.slice(0, separator) : node.state.locale;
  const path = separator >= 0 ? input.reference.path.slice(separator + 1) : input.reference.path;
  const state = { ...node.state, locale };
  const current = await ensureVisible(state, { runtime: input.runtime, id: node.document.id });
  const data = await currentData(state, { runtime: input.runtime, document: current });
  const previous = structuredClone(data);
  if (!removeReference(data, path, input.targetId)) return;
  const [top] = path.split('.');
  if (!top || data[top] === undefined) fail('invalid_input');
  await saveInTransaction(state, {
    runtime: input.runtime,
    values: {
      collection: state.collection.key,
      id: current.id,
      revision: current.revision,
      data: snapshotPatch({ fields: state.collection.fields, previous, next: data }),
    },
    kind: 'relationshipRemoved',
  });
}

async function archiveNode(node: ArchiveNode, runtime: ContentRuntime): Promise<void> {
  const current = await ensureVisible(node.state, { runtime, id: node.document.id, trashed: true });
  if (current.trashedAt) return;
  await node.state.tx.query(
    "UPDATE content_jobs SET status='cancelled',owner=NULL,lease_until=NULL,version_id=NULL,finished_at=clock_timestamp(),updated_at=clock_timestamp() WHERE document_id=$1 AND action='publication' AND status IN('queued','running')",
    [current.id],
  );
  await node.state.tx.query(
    "UPDATE content_job_items SET status='cancelled' WHERE status='queued' AND job_id IN(SELECT id FROM content_jobs WHERE document_id=$1 AND action='publication' AND status='cancelled')",
    [current.id],
  );
  const time = await node.state.tx.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  const now = time.rows[0]?.now;
  if (!now) fail('temporarily_unavailable');
  await runtime.store.updateDocumentPointers(node.state.tx, {
    collection: node.state.collection.key,
    id: current.id,
    expectedRevision: current.revision,
    revision: current.revision + 1,
    currentVersionId: current.currentVersionId,
    publishedVersionId: null,
    clearPublications: true,
    trashedAt: now.toISOString(),
  });
  await runtime.store.syncActiveUnique(node.state.tx, {
    collection: node.state.collection.key,
    id: current.id,
  });
  await auditContent(node.state, { runtime, id: current.id, detail: { kind: 'archived' } });
}

export async function archiveInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; revision: number },
): Promise<{ id: string; versionId: string }> {
  const current = await ensureVisible(state, {
    runtime: input.runtime,
    id: input.id,
    trashed: true,
  });
  if (current.trashedAt) return { id: current.id, versionId: current.currentVersionId };
  requireRevision(current, input.revision);
  const graph = await archiveGraph(state, input);
  await lockArchiveGraph(input.runtime, graph);
  for (const node of graph.values()) {
    if (!node.archive) continue;
    const incoming = await archiveIncoming(node.state, {
      runtime: input.runtime,
      id: node.document.id,
    });
    if (incoming.some((reference) => !graph.has(reference.sourceDocumentId)))
      fail('version_conflict');
    for (const reference of node.incoming.filter((item) => item.onDelete === 'nullify')) {
      const source = graph.get(reference.sourceDocumentId);
      if (source)
        await nullifySource(source, {
          runtime: input.runtime,
          targetId: node.document.id,
          reference,
        });
    }
  }
  for (const node of graph.values()) if (node.archive) await archiveNode(node, input.runtime);
  return { id: current.id, versionId: current.currentVersionId };
}

async function archiveDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.archive'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'documents.archive', collection: input.collection },
    async (state) => {
      const result = await archiveInTransaction(state, {
        runtime,
        id: input.id,
        revision: input.revision,
      });
      return projectDocument(state, {
        runtime,
        document: await ensureVisible(state, { runtime, id: result.id, trashed: true }),
      });
    },
  );
}

export function createArchiveApi(runtime: ContentRuntime) {
  return {
    archiveDocument: (ctx: RequestContext, raw: unknown) => archiveDocument(runtime, ctx, raw),
  };
}

function rejectRestrictive(incoming: readonly InboundReference[]): void {
  if (incoming.some((reference) => reference.onDelete === 'restrict')) fail('resource_in_use');
}
