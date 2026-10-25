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
}): ContentStore {
  return {
    ...createHistoryStore(options),
    definition: (collection, schemaVersion) =>
      options.mapping.get(collection, schemaVersion).definition,
    readDocument: (tx, input) => readDocument(tx, { ...options, ...input }),
    lockDocuments,
    queryCollections: (tx, input) => queryCollections(tx, { ...options, ...input }),
    readRevisionDataBatch: (tx, input) => readRevisionDataBatch(tx, { ...options, ...input }),
    async insertDocument(tx, input) {
      await requireWritableSchema(tx, { ...options, ...input });
      return insertDocument(tx, { ...options, ...input });
    },
    async insertRevision(tx, input) {
      await requireWritableSchema(tx, { ...options, ...input });
      const revision = await insertRevision(tx, { ...options, ...input });
      await writeIndexProjections(tx, { ...options, ...input, versionId: input.id });
      return revision;
    },
    readRevisionData: (tx, input) => readRevisionData(tx, { ...options, ...input }),
    readRevision: (tx, input) => readRevision(tx, { ...options, ...input }),
    async updateDocumentPointers(tx, input) {
      await requireWritableSchema(tx, { ...options, ...input });
      return updateDocumentPointers(tx, { ...options, ...input });
    },
    queryDocuments: (tx, input) => queryDocuments(tx, { ...options, ...input }),
    backfillSchema: (tx, input) => backfillSchema(tx, { ...options, ...input }),
    activateSchema: (tx) => activateSchema(tx, options),
    syncActiveUnique: (tx, input) => syncActiveUnique(tx, { ...options, ...input }),
  };
}
