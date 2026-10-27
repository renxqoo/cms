import { readableJoinLocations } from '../joins/locations.ts';
import type { DocumentView } from '../model.ts';
import type { ContentState } from '../types.ts';
import type { FieldDefinition } from '../definition.ts';

interface JoinInstance {
  view: DocumentView;
  path: string;
}
interface JoinGroup {
  field: FieldDefinition;
  path: string;
  instances: JoinInstance[];
}

export async function joinGroups(
  state: ContentState,
  input: { views: readonly DocumentView[]; select?: readonly string[] | undefined },
): Promise<JoinGroup[]> {
  const groups = new Map<string, JoinGroup>();
  for (const view of input.views) {
    for (const { field, path, schemaPath } of await readableJoinLocations(state, {
      data: view.data,
      policyData: state.readPolicyData?.get(view.data) ?? view.data,
      documentId: view.id,
    })) {
      if (field.type !== 'join' || !field.join) continue;
      const group = groups.get(field.id) ?? {
        field,
        path: schemaPath,
        instances: [],
      };
      group.instances.push({ view, path });
      groups.set(field.id, group);
    }
  }
  return [...groups.values()].filter(
    ({ path }) =>
      !input.select ||
      input.select.some(
        (selected) =>
          selected === path || path.startsWith(`${selected}.`) || selected.startsWith(`${path}.`),
      ),
  );
}
