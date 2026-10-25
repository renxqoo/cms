import { afterEach } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type {
  ContentFixture,
  FixtureOptions,
} from '../../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition } from '../../definition.ts';
import type { EditorNode } from '../contracts.ts';

const fixtures: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0).toReversed()) await kit.close();
});

export async function fixture(
  collections = workflowCollections(),
  options: Omit<FixtureOptions, 'collections'> = {},
): Promise<ContentFixture> {
  const kit = await createContentFixture({ ...options, collections });
  fixtures.push(kit);
  return kit;
}

export function retain<T extends { close(): Promise<void> }>(kit: T): T {
  fixtures.push(kit);
  return kit;
}

export function article(collections: CollectionDefinition[]): CollectionDefinition {
  const value = collections.find((item) => item.key === 'articles');
  if (!value) throw new Error('Articles fixture missing');
  return value;
}

export function node(nodes: readonly EditorNode[], id: string): EditorNode {
  const result = findNode(nodes, id);
  if (!result) throw new Error(`Editor node ${id} missing`);
  return result;
}

function findNode(nodes: readonly EditorNode[], id: string): EditorNode | undefined {
  for (const value of nodes) {
    if (value.id === id) return value;
    const found = findNode(
      [
        ...(value.children ?? []),
        ...(value.blocks ?? []).flatMap((block) => block.children),
        ...(value.tabs ?? []).flatMap((tab) => tab.children),
      ],
      id,
    );
    if (found) return found;
  }
  return undefined;
}
