import { actorReference } from '@new-cms/cms/access';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { AuthorIdentity } from '@new-cms/cms/access';
import { authorshipSettings } from './config.ts';
import type { DocumentRow } from '../model.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

function denied(error: unknown) {
  return (
    error instanceof CmsError &&
    ['forbidden', 'unauthenticated', 'endpoint_unbound', 'not_found'].includes(error.code)
  );
}
export async function authorReadPermission(
  state: Pick<ContentState, 'tx' | 'actor' | 'collection'>,
  runtime: ContentRuntime,
): Promise<boolean> {
  const settings = authorshipSettings(state.collection);
  if (!settings.createdBy && !settings.updatedBy) return false;
  try {
    await runtime.authorizeActor(state.tx, {
      actor: actorReference(state.actor),
      operationId: 'admins.get',
      scope: { scopeKind: 'global', collectionKey: null },
    });
    return true;
  } catch (error) {
    if (!denied(error)) throw error;
    return false;
  }
}
async function readAuthor(
  state: ContentState,
  runtime: ContentRuntime,
  id: string | null,
): Promise<AuthorIdentity | null> {
  if (id === null || !state.authorshipReadable || !runtime.resolveAuthor) return null;
  state.authorCache ??= new Map();
  let author = state.authorCache.get(id);
  if (!author) {
    author = runtime
      .resolveAuthor(state.tx, { viewer: actorReference(state.actor), id })
      .catch((error: unknown) => {
        if (!denied(error)) throw error;
        return null;
      });
    state.authorCache.set(id, author);
  }
  return author;
}
export async function projectAuthorship(
  state: ContentState,
  input: { runtime: ContentRuntime; document: DocumentRow },
) {
  const settings = authorshipSettings(state.collection);
  return {
    ...(settings.createdBy
      ? { createdBy: await readAuthor(state, input.runtime, input.document.createdById) }
      : {}),
    ...(settings.updatedBy
      ? { updatedBy: await readAuthor(state, input.runtime, input.document.updatedById) }
      : {}),
  };
}
export function authorshipMetadata(state: ContentState) {
  const settings = authorshipSettings(state.collection);
  return {
    ...settings,
    queryable: state.authorshipReadable === true && (settings.createdBy || settings.updatedBy),
  };
}
