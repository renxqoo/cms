import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime } from '../types.ts';
import type { ContentDeliveryOptions } from './types.ts';
import { parseCatalogQuery, publicLocaleSchema } from './query.ts';
import { readCatalog } from './catalog.ts';
import { readDocuments, readHome, readInterface, readModel } from './readers.ts';
import { readIntegrations } from './integrations.ts';
import { createExporter } from './export.ts';
import { createPreviewApi } from './preview.ts';
import { createPublicMediaApi } from './media.ts';
import { createPublicRunner } from './runner.ts';
import { validateDeliveryOptions } from './options.ts';

const slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const key = z.string().min(1).max(80);
const localeInput = z.object({ locale: publicLocaleSchema }).strict();
const modelInput = z.object({ locale: publicLocaleSchema, slug }).strict();
const interfaceInput = z
  .object({ locale: publicLocaleSchema, messageContractVersion: key.optional() })
  .strict();
const documentsInput = z.object({ locale: publicLocaleSchema, slug: slug.optional() }).strict();
const integrationsInput = z
  .object({
    locale: publicLocaleSchema,
    slug,
    bindingKey: key.optional(),
    scenarioKey: key.optional(),
    recipeKey: key.optional(),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) fail('invalid_input');
  return result.data;
}
export function createContentDelivery(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  validateDeliveryOptions(runtime, options);
  const run = createPublicRunner(runtime, options);
  return {
    ...createPublicMediaApi(runtime, options),
    ...createPreviewApi(runtime, options),
    exportContent: createExporter(runtime, options),
    async getInterface(raw: unknown, signal?: AbortSignal) {
      const input = parse(interfaceInput, raw);
      return run(input.locale, signal, (session, languages, initialized) =>
        readInterface(session, { languages, initialized, version: input.messageContractVersion }),
      );
    },
    async getHome(raw: unknown, signal?: AbortSignal) {
      const input = parse(localeInput, raw);
      return run(input.locale, signal, readHome);
    },
    async listModels(raw: unknown, signal?: AbortSignal) {
      const input = parseCatalogQuery(raw);
      return run(input.locale, signal, (session) => readCatalog(session, input));
    },
    async getModel(raw: unknown, signal?: AbortSignal) {
      const input = parse(modelInput, raw);
      return run(input.locale, signal, (session) => readModel(session, input.slug));
    },
    async getDocuments(raw: unknown, signal?: AbortSignal) {
      const input = parse(documentsInput, raw);
      return run(input.locale, signal, (session) => readDocuments(session, input.slug));
    },
    async getIntegrations(raw: unknown, signal?: AbortSignal) {
      const input = parse(integrationsInput, raw);
      return run(input.locale, signal, (session) => readIntegrations(session, input));
    },
  };
}
export type ContentDeliveryApi = ReturnType<typeof createContentDelivery>;
