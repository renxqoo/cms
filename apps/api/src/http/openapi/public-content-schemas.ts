import { array, id, integer, nullable, object, reference, text, time } from './schema.ts';
import type { Schema } from './schema.ts';

function envelope(data: Schema): Schema {
  return object({
    contractVersion: { const: 'oneaster-public.v1' },
    locale: text,
    revision: text,
    data,
  });
}
const json = { type: 'object' };
const media = object({
  bindingId: id,
  mediaDocumentId: id,
  url: text,
  mimeType: text,
  bytes: integer,
  digest: text,
  width: nullable(integer),
  height: nullable(integer),
  alt: text,
});
const mediaMap = { type: 'object', additionalProperties: reference('PublicMedia') };
const translations = array(
  object({
    locale: text,
    slug: text,
    canonicalPath: text,
    updatedAt: time,
    allowIndex: { type: 'boolean' },
  }),
);
const seo = object({
  title: text,
  description: text,
  canonicalPath: text,
  allowIndex: { type: 'boolean' },
  image: nullable(reference('PublicMedia')),
});
const relationMap = {
  type: 'object',
  additionalProperties: object({ id, collection: text, title: text, url: text }),
};
const model = object({
  id,
  versionId: id,
  modelId: text,
  slug: text,
  title: text,
  summary: text,
  primaryCategory: { enum: ['text', 'image', 'video', 'embedding', 'audio'] },
  contentLocales: array(text),
  developer: nullable(
    object({ id, title: text, website: nullable(text), logo: nullable(reference('PublicMedia')) }),
  ),
  family: nullable(text),
  version: nullable(text),
  versionKind: { enum: ['rolling', 'snapshot', null] },
  releaseDate: nullable(text),
  officialUrl: nullable(text),
  technicalCapabilities: object({
    inputs: array(text),
    outputs: array(text),
    tasks: array(text),
    features: array(text),
  }),
  specifications: json,
  apiBindings: array(json),
  defaultBindingKey: nullable(text),
  parameterReference: nullable(json),
  platformAccess: { enum: ['supported', 'unsupported'] },
  content: json,
  showcase: array(json),
  presentation: object({ featured: { type: 'boolean' }, sortOrder: integer }),
  logo: nullable(reference('PublicMedia')),
  media: mediaMap,
  relations: relationMap,
  seo,
  translations,
  updatedAt: time,
});
const record = object({
  id,
  versionId: id,
  publishedAt: time,
  updatedAt: time,
  data: json,
  media: mediaMap,
  relations: relationMap,
  seo,
  translations,
});
const navigationItem = object({
  id,
  slug: text,
  title: text,
  navigationLabel: text,
  order: integer,
});
const document = object({
  id,
  versionId: id,
  slug: text,
  title: text,
  summary: text,
  navigationLabel: text,
  order: integer,
  body: json,
  media: mediaMap,
  relations: relationMap,
  seo,
  translations,
  updatedAt: time,
});
const facet = array(object({ value: text, label: text, count: integer }));

const schemas: Record<string, Schema> = {
  PublicMedia: media,
  PublicRecord: record,
  PublicModel: model,
  PublicDocument: document,
  PublicInterface: envelope(
    object({
      languages: object({
        defaultLocale: text,
        locales: array(
          object({
            code: text,
            label: text,
            shortLabel: text,
            htmlLang: text,
            direction: { enum: ['ltr', 'rtl'] },
          }),
        ),
      }),
      messageContractVersion: text,
      messages: json,
      site: nullable(reference('PublicRecord')),
      initialized: { type: 'boolean' },
    }),
  ),
  PublicHome: envelope(
    object({
      home: nullable(reference('PublicRecord')),
      featuredModels: array(reference('PublicModel')),
    }),
  ),
  PublicModelCatalog: envelope(
    object({
      models: array(reference('PublicModel')),
      pagination: object({
        page: integer,
        pageSize: integer,
        total: integer,
        totalPages: integer,
      }),
      facets: object({
        categories: facet,
        developers: facet,
        tasks: facet,
        inputs: facet,
        outputs: facet,
        capabilities: facet,
      }),
    }),
  ),
  PublicModelDetail: envelope(
    object({ model: reference('PublicModel'), related: array(reference('PublicModel')) }),
  ),
  PublicDocumentPage: envelope(
    object({
      document: nullable(reference('PublicDocument')),
      navigation: array(navigationItem),
      total: integer,
      indexUrl: text,
    }),
  ),
  PublicIntegrations: envelope(
    object({
      modelId: text,
      bindingKey: text,
      profileKey: text,
      recipeKey: text,
      flowKey: text,
      scenarioKey: text,
      examples: array(
        object({
          key: { enum: ['curl', 'python', 'javascript', 'typescript', 'go', 'java', 'php'] },
          language: text,
          code: text,
          requirements: array(text),
        }),
      ),
      agentInstructions: text,
      documentationUrl: nullable(text),
    }),
  ),
  PublicPreviewTicket: object({ ticketId: id, expiresAt: time, url: text }),
  PublicPreviewRevoked: object({
    success: { const: true },
    data: object({ revoked: { const: true } }),
  }),
  PublicExportFrame: {
    oneOf: [
      object({
        type: { const: 'start' },
        contractVersion: { const: 'oneaster-public.v1' },
        kind: { enum: ['documents', 'model-guides', 'sitemap'] },
        locale: text,
        id,
      }),
      object({ type: { const: 'item' }, sequence: { type: 'integer', minimum: 0 }, data: json }),
      object({ type: { const: 'end' }, count: { type: 'integer', minimum: 0 }, digest: text }),
      object({ type: { const: 'error' }, code: text }),
    ],
  },
};
export function publicContentResponseSchemas(): Record<string, Schema> {
  return { ...schemas };
}

const names: Record<string, string> = {
  'publicContent.interface': 'PublicInterface',
  'publicContent.home': 'PublicHome',
  'publicContent.models': 'PublicModelCatalog',
  'publicContent.model': 'PublicModelDetail',
  'publicContent.documents': 'PublicDocumentPage',
  'publicContent.document': 'PublicDocumentPage',
  'publicContent.integrations': 'PublicIntegrations',
  'previewContent.integrations': 'PublicIntegrations',
  'previewContent.model': 'PublicModelDetail',
  'previewContent.revoke': 'PublicPreviewRevoked',
  'documents.createPreviewTicket': 'PublicPreviewTicket',
};
const publicHeaders = { ETag: { schema: text }, 'Cache-Control': { schema: text } };
const previewHeaders = {
  'Cache-Control': { schema: text },
  'X-Preview-Expires-At': { schema: time },
  'X-Robots-Tag': { schema: text },
  'Referrer-Policy': { schema: text },
};
export function publicContentResponses(
  operationId: string,
  status: string,
): Record<string, unknown> | undefined {
  const name = names[operationId];
  const headers = operationId.startsWith('previewContent.') ? previewHeaders : publicHeaders;
  if (name) {
    const response: Record<string, unknown> = {
      [status]: {
        description: 'Completed',
        headers,
        content: { 'application/json': { schema: reference(name) } },
      },
    };
    if (operationId.startsWith('publicContent.'))
      response['304'] = { description: 'Existing representation matches If-None-Match', headers };
    return response;
  }
  if (operationId === 'documents.revokePreviewTicket')
    return {
      '200': {
        description: 'Preview ticket revoked',
        content: { 'application/json': { schema: object({ revoked: { const: true } }) } },
      },
    };
  if (operationId === 'publicContent.index' || operationId === 'publicContent.sitemap')
    return {
      '200': {
        description:
          'Bounded NDJSON export; start, item and verified end frames. Truncated streams or error frames are unsuccessful exports.',
        content: { 'application/x-ndjson': { schema: reference('PublicExportFrame') } },
      },
    };
  if (operationId !== 'publicContent.media' && operationId !== 'previewContent.media')
    return undefined;
  return mediaResponses(operationId, headers);
}

function mediaResponses(
  operationId: string,
  headers: Record<string, unknown>,
): Record<string, unknown> {
  const binary = {
    description: 'Authorized media stream',
    headers: {
      ...headers,
      'Content-Length': { schema: integer },
      'Content-Range': { schema: text },
      'Accept-Ranges': { schema: text },
    },
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  };
  return {
    '200': binary,
    '206': binary,
    '416': { description: 'Single byte range is unsatisfiable' },
    ...(operationId === 'publicContent.media'
      ? { '304': { description: 'Authorized representation matches If-None-Match', headers } }
      : {}),
  };
}
