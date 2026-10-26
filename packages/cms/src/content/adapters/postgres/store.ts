import type { SqlExecutor } from '@new-cms/database/client';
import { requireWritableSchema } from './schema-state.ts';
import { backfillSchema, activateSchema } from './schema-backfill.ts';
import { queryCollections } from './query-collections.ts';
import { writeIndexProjections } from './index-projections.ts';
import type { ContentLimits } from '../../definition.ts';
import type { ContentMapping } from '../../model.ts';
import type { ContentStore } from './store-contract.ts';
import { createHistoryStore } from './history-store.ts';
import {
  insertDocument,
  lockDocuments,
  readDocument,
  updateDocumentPointers,
} from './document-store.ts';
import { insertRevision, readRevision, readRevisionData } from './revision-data.ts';
import { queryDocuments } from './query-documents.ts';
import { readRevisionDataBatch } from './read-data-batch.ts';
import { syncActiveUnique } from './unique-reservations.ts';

export function createContentStore(options: {
  mapping: ContentMapping;
  limits: ContentLimits;
  mappingFor?(tx: SqlExecutor): Promise<ContentMapping>;
}): ContentStore {
  async function scoped(tx: SqlExecutor) {
    return {
      ...options,
      mapping: options.mappingFor ? await options.mappingFor(tx) : options.mapping,
    };
  }
  return {
    ...createHistoryStore(options),
    definition: (collection, schemaVersion) =>
      options.mapping.get(collection, schemaVersion).definition,
    readDocument: async (tx, input) => readDocument(tx, { ...(await scoped(tx)), ...input }),
    lockDocuments,
    queryCollections: async (tx, input) =>
      queryCollections(tx, { ...(await scoped(tx)), ...input }),
    readRevisionDataBatch: async (tx, input) =>
      readRevisionDataBatch(tx, { ...(await scoped(tx)), ...input }),
    async insertDocument(tx, input) {
      const current = await scoped(tx);
      await requireWritableSchema(tx, { ...current, ...input });
      return insertDocument(tx, { ...current, ...input });
    },
    async insertRevision(tx, input) {
      const current = await scoped(tx);
      await requireWritableSchema(tx, { ...current, ...input });
      const revision = await insertRevision(tx, { ...current, ...input });
      await writeIndexProjections(tx, { ...current, ...input, versionId: input.id });
      return revision;
    },
    readRevisionData: async (tx, input) =>
      readRevisionData(tx, { ...(await scoped(tx)), ...input }),
    readRevision: async (tx, input) => readRevision(tx, { ...(await scoped(tx)), ...input }),
    async updateDocumentPointers(tx, input) {
      const current = await scoped(tx);
      await requireWritableSchema(tx, { ...current, ...input });
      return updateDocumentPointers(tx, { ...current, ...input });
    },
    queryDocuments: async (tx, input) => queryDocuments(tx, { ...(await scoped(tx)), ...input }),
    backfillSchema: async (tx, input) => backfillSchema(tx, { ...(await scoped(tx)), ...input }),
    activateSchema: async (tx) => activateSchema(tx, await scoped(tx)),
    syncActiveUnique: async (tx, input) =>
      syncActiveUnique(tx, { ...(await scoped(tx)), ...input }),
  };
}
