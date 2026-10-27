import type { Credential } from '../../../contracts/credentials';
import type { AllowedOperation } from '../../../contracts/auth';
import type { Collection } from '../../../contracts/content';

export const articleRead: AllowedOperation = {
  operationId: 'documents.get',
  scopeKind: 'collection',
  collectionKey: 'articles',
};
export const systemRead: AllowedOperation = {
  operationId: 'admins.list',
  scopeKind: 'global',
  collectionKey: null,
};
export const articleCollection: Collection = {
  key: 'articles',
  label: 'Articles',
  schemaVersion: 1,
  mode: 'direct',
  history: false,
  singleton: false,
  defaultLocale: 'en',
  defaultSort: [],
  orderable: false,
  locales: ['en'],
  dataSchema: {},
  fields: [],
  behaviorHash: 'hash',
  mappingFingerprint: 'fingerprint',
  upload: false,
  drafts: null,
  capabilities: {
    autosave: false,
    publication: false,
    schedules: false,
    history: false,
    trash: true,
    purge: true,
  },
};
export const credential: Credential = {
  id: '10000000-0000-4000-8000-000000000001',
  kind: 'api_key',
  name: 'Article reader',
  prefix: 'cms_key_prefix',
  clientId: null,
  clientName: null,
  resource: 'mcp',
  grants: [articleRead],
  createdAt: '2026-10-27T00:00:00.000Z',
  expiresAt: '2026-11-27T00:00:00.000Z',
  revokedAt: null,
  lastUsedAt: null,
  status: 'active',
};
export const authorization = {
  id: 'opaque_request-123',
  clientId: 'cms-cli',
  clientName: 'CMS CLI',
  redirectUri: 'http://127.0.0.1:45832/callback',
  resource: 'https://cms.example.test',
  scopes: ['cms', 'offline_access'],
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  availableGrants: [articleRead],
};
