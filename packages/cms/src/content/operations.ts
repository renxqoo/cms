import type { OperationDefinition } from '@new-cms/cms/platform/contracts';

interface Declaration {
  id: string;
  method: OperationDefinition['method'];
  path: string;
  idempotency?: NonNullable<OperationDefinition['idempotency']>;
  successStatus?: NonNullable<OperationDefinition['successStatus']>;
}

const scoped: Declaration[] = [
  {
    id: 'languages.setDefault',
    method: 'POST',
    path: '/documents/:id/default-language',
    idempotency: 'required',
  },
  { id: 'collections.get', method: 'GET', path: '' },
  { id: 'collections.editor', method: 'GET', path: '/editor' },
  { id: 'content.listJobs', method: 'GET', path: '/jobs' },
  { id: 'documents.list', method: 'GET', path: '/documents' },
  {
    id: 'documents.create',
    method: 'POST',
    idempotency: 'required',
    successStatus: 201,
    path: '/documents',
  },
  { id: 'documents.get', method: 'GET', path: '/documents/:id' },
  {
    id: 'documents.createPreviewTicket',
    method: 'POST',
    path: '/documents/:id/preview-tickets',
    successStatus: 201,
  },
  {
    id: 'documents.revokePreviewTicket',
    method: 'DELETE',
    path: '/documents/:id/preview-tickets/:ticketId',
  },
  { id: 'documents.update', method: 'PATCH', path: '/documents/:id' },
  { id: 'documents.archive', method: 'DELETE', path: '/documents/:id' },
  {
    id: 'documents.copy',
    method: 'POST',
    idempotency: 'required',
    successStatus: 201,
    path: '/documents/:id/copies',
  },
  {
    id: 'documents.restoreTrash',
    method: 'POST',
    idempotency: 'required',
    successStatus: 200,
    path: '/documents/:id/trash-restorations',
  },
  {
    id: 'documents.purge',
    method: 'POST',
    idempotency: 'required',
    successStatus: 200,
    path: '/documents/:id/purges',
  },
  {
    id: 'documents.autosave',
    method: 'POST',
    idempotency: 'required',
    successStatus: 201,
    path: '/documents/:id/autosaves',
  },
  {
    id: 'documents.publish',
    method: 'POST',
    idempotency: 'required',
    successStatus: 200,
    path: '/documents/:id/publications',
  },
  { id: 'documents.unpublish', method: 'DELETE', path: '/documents/:id/publication' },
  { id: 'versions.list', method: 'GET', path: '/documents/:id/versions' },
  { id: 'versions.get', method: 'GET', path: '/documents/:id/versions/:versionId' },
  {
    id: 'versions.restore',
    method: 'POST',
    idempotency: 'required',
    successStatus: 201,
    path: '/documents/:id/restorations',
  },
  { id: 'versions.diff', method: 'GET', path: '/documents/:id/version-diff' },
  {
    id: 'content.schedulePublication',
    method: 'POST',
    idempotency: 'required',
    successStatus: 202,
    path: '/documents/:id/publication-schedules',
  },
  {
    id: 'content.cancelPublicationSchedule',
    method: 'DELETE',
    path: '/documents/:id/publication-schedules/:scheduleId',
  },
  {
    id: 'content.batch',
    method: 'POST',
    idempotency: 'required',
    successStatus: 200,
    path: '/batches',
  },
  { id: 'content.getJob', method: 'GET', path: '/jobs/:jobId' },
  { id: 'resources.references', method: 'GET', path: '/documents/:id/references' },
];

const folders: Declaration[] = [
  { id: 'folders.list', method: 'GET', path: '/folders' },
  {
    id: 'folders.create',
    method: 'POST',
    idempotency: 'required',
    successStatus: 201,
    path: '/folders',
  },
  { id: 'folders.update', method: 'PATCH', path: '/folders/:id' },
  { id: 'folders.delete', method: 'DELETE', path: '/folders/:id' },
];

function definition(input: Declaration, collectionPath: boolean): OperationDefinition {
  return {
    ...input,
    path: collectionPath ? `/v1/collections/:collection${input.path}` : `/v1${input.path}`,
    module: 'content',
    access: 'permission',
    scopeKind: 'collection',
    bindingConfigurable: true,
  };
}

export const contentOperations: readonly OperationDefinition[] = [
  {
    id: 'collections.list',
    method: 'GET',
    path: '/v1/collections',
    module: 'content',
    access: 'authenticated',
    scopeKind: 'global',
    bindingConfigurable: false,
  },
  {
    id: 'resources.list',
    method: 'GET',
    path: '/v1/resources',
    module: 'content',
    access: 'authenticated',
    scopeKind: 'global',
    bindingConfigurable: false,
  },
  ...scoped.map((input) => definition(input, true)),
  ...folders.map((input) => definition(input, false)),
];
