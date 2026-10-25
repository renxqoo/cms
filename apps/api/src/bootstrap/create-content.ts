import type { Database } from '@new-cms/database/client';
import {
  contentMappingFingerprint,
  contentBehaviorHash,
} from '@new-cms/database/schema/generated/content';
import type { AccessAuthorization } from '@new-cms/cms/access';
import type { AccessActorAuthorization } from '@new-cms/cms/access/composition';
import { createContent } from '@new-cms/cms/content/composition';
import { createAssets, assetDiscoverySources } from '@new-cms/cms/assets/composition';
import { compileContent } from '@new-cms/cms/content/generate';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { applicationRegistry } from '../config/content-registry.ts';
import {
  contentLimits,
  contentWorkPolicy,
  assetLimits,
  contentUploadPolicy,
} from '../config/content-policy.ts';
import { createLocalStorage } from '../adapters/storage/local.ts';
import { createS3Storage } from '../adapters/storage/s3.ts';
import { createSharpProcessor } from '../adapters/images/sharp.ts';
import type { StorageConfig } from './storage-config.ts';

export function contentConfiguration() {
  const limits = contentLimits();
  const registry = applicationRegistry(limits);
  if (registry.behaviorHash !== contentBehaviorHash)
    throw new Error('Generated content behavior differs from configuration');
  const mapping = compileContent(registry);
  if (mapping.fingerprint !== contentMappingFingerprint)
    throw new Error('Generated content mapping differs from configuration');
  return { registry, mapping, limits };
}

export function createContentServices(input: {
  database: Database;
  policy: CmsPolicy;
  authorize: AccessAuthorization;
  authorizeActor: AccessActorAuthorization;
  storage: StorageConfig;
  configuration: ReturnType<typeof contentConfiguration>;
}) {
  const workPolicy = contentWorkPolicy();
  const imageLimits = assetLimits();
  const storage =
    input.storage.kind === 'local'
      ? createLocalStorage({ root: input.storage.root })
      : createS3Storage({ ...input.storage, timeoutMs: input.policy.statementTimeoutMs });
  const images = createSharpProcessor();
  const assets: ReturnType<typeof createAssets> = createAssets({
    database: input.database,
    policy: input.policy,
    limits: imageLimits,
    resourceLockKey: workPolicy.resourceLockKey,
    authorize: input.authorize,
    authorizeActor: input.authorizeActor,
    authorizeContent: (tx, request) => content.authorizeMedia(tx, request),
    commitProcessing: (tx, request) => content.participants.commitProcessing(tx, request),
    storage,
    images,
  });
  const content: ReturnType<typeof createContent> = createContent({
    database: input.database,
    policy: input.policy,
    ...input.configuration,
    workPolicy,
    uploadPolicy: contentUploadPolicy(imageLimits),
    authorize: input.authorize,
    authorizeActor: input.authorizeActor,
    assets: assets.participants,
    uploadApi: assets.api,
    readAssetJob: assets.api.readJob,
    assetDiscoverySources,
    afterCommitHandlers: {},
  });
  return { content, assets };
}
