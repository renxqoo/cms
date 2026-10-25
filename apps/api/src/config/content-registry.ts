import { createRegistry } from '@new-cms/cms/content/generate';
import type { ContentLimits } from '@new-cms/cms/content/generate';
import { contentOperations } from '@new-cms/cms/content';
import { assetsOperations } from '@new-cms/cms/assets';
import { collections } from './collections/index.ts';
import { contentLimits } from './content-policy.ts';

export function applicationRegistry(limits: ContentLimits = contentLimits()) {
  return createRegistry({
    collections,
    limits,
    operations: [...contentOperations, ...assetsOperations],
  });
}
