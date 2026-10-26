import { z } from 'zod';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';

const routes = [
  ['publicContent.interface', '/v1/public/interface'],
  ['publicContent.home', '/v1/public/home'],
  ['publicContent.models', '/v1/public/models'],
  ['publicContent.integrations', '/v1/public/models/:slug/integrations'],
  ['publicContent.model', '/v1/public/models/:slug'],
  ['publicContent.documents', '/v1/public/docs'],
  ['publicContent.document', '/v1/public/docs/:slug'],
  ['publicContent.index', '/v1/public/index'],
  ['publicContent.sitemap', '/v1/public/sitemap'],
  ['publicContent.media', '/v1/public/media/:bindingId'],
  ['previewContent.integrations', '/v1/preview/models/:slug/integrations'],
  ['previewContent.model', '/v1/preview/models/:slug'],
  ['previewContent.media', '/v1/preview/media/:bindingId'],
] as const;

export const publicContentOperations: readonly OperationDefinition[] = [
  ...routes.map(([id, path]): OperationDefinition => ({
    id,
    path,
    method: 'GET',
    module: 'content',
    access: 'public',
    scopeKind: 'global',
    bindingConfigurable: false,
  })),
  {
    id: 'previewContent.revoke',
    path: '/v1/preview/revoke',
    method: 'POST',
    module: 'content',
    access: 'public',
    scopeKind: 'global',
    bindingConfigurable: false,
  },
];
const locale = z.string().max(80).optional();
const slug = z.string().min(1).max(200);
const catalog = z.strictObject({
  locale,
  page: z.string().optional(),
  pageSize: z.string().optional(),
  q: z.string().max(120).optional(),
  category: z.string().optional(),
  task: z.string().optional(),
  developer: z.string().optional(),
  input: z.string().optional(),
  output: z.string().optional(),
  capability: z.string().optional(),
  featured: z.enum(['true', 'false']).optional(),
  callable: z.enum(['true', 'false']).optional(),
  ids: z.string().optional(),
  sort: z.enum(['order', 'title', 'updated']).optional(),
});
export const publicContentInputSchemas: Readonly<Record<string, z.ZodType>> = {
  'publicContent.interface': z.strictObject({ locale, messageContractVersion: z.string().max(80) }),
  'publicContent.home': z.strictObject({ locale }),
  'publicContent.models': catalog,
  'publicContent.model': z.strictObject({ slug, locale }),
  'publicContent.integrations': z.strictObject({
    slug,
    locale,
    bindingKey: z.string().max(120).optional(),
    scenarioKey: z.string().max(120).optional(),
    recipeKey: z.string().max(120).optional(),
  }),
  'publicContent.documents': z.strictObject({ locale }),
  'publicContent.document': z.strictObject({ slug, locale }),
  'publicContent.index': z.strictObject({ kind: z.enum(['documents', 'model-guides']), locale }),
  'publicContent.sitemap': z.strictObject({ bucket: z.string().optional() }),
  'publicContent.media': z.strictObject({ bindingId: z.uuid() }),
  'previewContent.integrations': z.strictObject({
    slug,
    locale: z.string().max(80),
    bindingKey: z.string().max(120).optional(),
    scenarioKey: z.string().max(120).optional(),
    recipeKey: z.string().max(120).optional(),
  }),
  'previewContent.model': z.strictObject({ slug, locale: z.string().max(80) }),
  'previewContent.media': z.strictObject({ bindingId: z.uuid() }),
  'previewContent.revoke': z.strictObject({}),
};
