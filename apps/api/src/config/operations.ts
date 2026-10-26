import { identityOperations } from '@new-cms/cms/identity';
import { accessOperations } from '@new-cms/cms/access';
import { contentOperations } from '@new-cms/cms/content';
import { assetsOperations } from '@new-cms/cms/assets';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';

export const applicationOperations: readonly OperationDefinition[] = [
  ...identityOperations,
  ...accessOperations,
  ...contentOperations,
  ...assetsOperations,
];
