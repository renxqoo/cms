import { fail } from '@new-cms/cms/platform/contracts';
import { budgetedExecutor } from '../runtime.ts';
import type { ContentRuntime } from '../types.ts';
import type { ContentDeliveryOptions, DeliverySession } from './types.ts';
import type { StoredDocument } from '../model.ts';
import type { PublicModelDetail } from './contracts.ts';
import { readPreviewGrant, assertPreviewIssuer } from './preview-grant.ts';
import { previewInput, privatePreviewInput, privateIntegrationsInput } from './preview-input.ts';
import { projectModels } from './projection.ts';
import { readLanguages, text } from './source.ts';
import { readIntegrations } from './integrations.ts';
import { envelope } from './integrity.ts';
function createPrivateReader(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  return async function read<T>(
    raw: { slug: string; locale: string; grant: string },
    signal: AbortSignal | undefined,
    work: (session: DeliverySession, row: StoredDocument) => Promise<T>,
  ) {
    return runtime.database.readOnlyTransaction(
      async (executor) => {
        const tx = budgetedExecutor(executor, options.policy.maxSqlQueries);
        const grant = await readPreviewGrant(tx, options, { grant: raw.grant });
        if (grant.locale !== raw.locale) fail('unauthenticated');
        const row = await assertPreviewIssuer(runtime, tx, grant);
        if (text(row.data['slug']) !== raw.slug) fail('unauthenticated');
        const languages = await readLanguages(runtime, tx);
        const session: DeliverySession = {
          runtime,
          options,
          tx,
          locale: grant.locale,
          enabledLocales: languages.source.enabled,
          preview: { documentId: grant.document_id, versionId: grant.revision_id },
        };
        const content = envelope(session.locale, await work(session, row));
        if (Buffer.byteLength(JSON.stringify(content)) > options.policy.maxResponseBytes)
          fail('payload_too_large');
        return { content, expiresAt: new Date(grant.expires_at).toISOString() };
      },
      AbortSignal.any([
        AbortSignal.timeout(options.policy.readTimeoutMs),
        ...(signal ? [signal] : []),
      ]),
    );
  };
}
async function draftDetail(
  session: DeliverySession,
  row: StoredDocument,
): Promise<PublicModelDetail> {
  const [model] = await projectModels(session, [row], true);
  if (!model) fail('internal_error');
  return { model, related: [] };
}
export function createPreviewReader(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  const read = createPrivateReader(runtime, options);
  return {
    async getPreviewModel(raw: unknown, signal?: AbortSignal) {
      const input = previewInput(privatePreviewInput, raw);
      return read(input, signal, draftDetail);
    },
    async getPreviewIntegrations(raw: unknown, signal?: AbortSignal) {
      const input = previewInput(privateIntegrationsInput, raw);
      return read(input, signal, async (session, row) =>
        readIntegrations(session, input, (await draftDetail(session, row)).model),
      );
    },
  };
}
