import { fail } from '@new-cms/cms/platform/contracts';
import { joinGroups } from '../documents/join-fields.ts';
import { joinedPages, joinPageJson } from './pages.ts';
import type { JoinedPageInput } from './pages.ts';
import { joinQueryFor } from './context.ts';
import { assignJoinValue } from './value.ts';
import type { ContentState } from '../types.ts';
import type { DocumentView } from '../model.ts';

export async function populateJoins(
  state: ContentState,
  input: Omit<JoinedPageInput, 'ids' | 'field' | 'query'> & {
    views: DocumentView[];
    select?: readonly string[] | undefined;
  },
): Promise<void> {
  for (const group of await joinGroups(state, input)) {
    const query = joinQueryFor(state, group.path);
    if (query === false) {
      for (const instance of group.instances) assignJoinValue(instance.view.data, instance.path);
      continue;
    }
    const occurrences = new Map<string, number>();
    for (const { view } of group.instances)
      occurrences.set(view.id, (occurrences.get(view.id) ?? 0) + 1);
    const pages = await joinedPages(state, {
      ...input,
      field: group.field,
      ids: [...occurrences.keys()],
      occurrences,
      ...(query ? { query } : {}),
    });
    for (const { view, path } of group.instances) {
      const page = pages.get(view.id);
      if (!page) fail('temporarily_unavailable');
      assignJoinValue(view.data, path, joinPageJson(page));
    }
  }
}
