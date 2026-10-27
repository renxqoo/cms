import type { JoinQueries } from './definition.ts';

import type { ContentState } from '../types.ts';

export function joinReadContext(
  state: ContentState,
  queries: JoinQueries | undefined,
): ContentState {
  if (queries !== undefined) state.joinRead = { collection: state.collection.key, queries };
  return state;
}

export function joinQueryFor(state: ContentState, path: string) {
  const configured = state.joinRead;
  if (configured?.queries === false) return false;
  return configured?.collection === state.collection.key ? configured.queries[path] : undefined;
}
