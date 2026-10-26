'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { downloadResponseSchema } from '../../contracts/download';
import { useApiQuery } from '../management-shared/query';
import { useAccessControl } from '../access-control/provider';
import { createBlobResource } from './blob-resource';
import type { AssetPreviewTarget } from './document-asset-types';

export function useAssetFile(target: AssetPreviewTarget) {
  const access = useAccessControl();
  const operation = target.kind === 'binding' ? 'assets.downloadBinding' : 'assets.download';
  const allowed = access.can(operation, {
    scopeKind: 'collection',
    collectionKey: target.collection,
  });
  const result = useApiQuery({
    operation,
    params: {
      collection: target.collection,
      id: target.id,
      ...(target.kind === 'binding' ? { bindingId: target.bindingId } : {}),
    },
    query: {
      mode: target.mode,
      ...(target.versionId ? { versionId: target.versionId } : {}),
      ...(target.variant ? { variant: target.variant } : {}),
    },
    response: downloadResponseSchema,
    enabled: allowed,
  });
  return { ...result, allowed };
}

export function useBlobUrl(blob: Blob | null) {
  const resource = useMemo(() => createBlobResource(blob), [blob]);
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot, () => null);
}
