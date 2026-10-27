import { fail } from '@new-cms/cms/platform/contracts';
import { hookContext, immutable, invoke } from '../hooks/invoke.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentView } from '../model.ts';
import type { AdminDocumentURLContext } from '../collections/admin-types.ts';

function adminURL(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (
    typeof value !== 'string' ||
    value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    fail('invalid_input');
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('invalid_input');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    fail('invalid_input');
  return value;
}
export async function attachAdminDocumentURLs(
  state: ContentState,
  input: { runtime: ContentRuntime; views: readonly DocumentView[] },
): Promise<void> {
  const callback = state.collection.admin?.formatDocURL;
  if (!callback) return;
  for (const document of input.views) {
    const context: AdminDocumentURLContext = Object.freeze({
      ...hookContext(state, { data: document.data, documentId: document.id }),
      data: immutable(document.data),
      siblingData: immutable(document.data),
      documentId: document.id,
      viewType: document.trashedAt === null ? 'list' : 'trash',
    });
    const resolved = adminURL(
      await invoke(state, { hook: callback, context, limits: input.runtime.limits }),
    );
    if (resolved !== undefined) document.adminURL = resolved;
  }
}
