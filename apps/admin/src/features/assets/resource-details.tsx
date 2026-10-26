'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { NativeSelect } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import type { Document } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { AssetPreview } from './asset-preview';
import { ResourceReferences } from './resource-references';
import { ResourceRestoreDialog } from './resource-restore-dialog';
import { assetMessages } from './messages';

export function ResourceDetails({
  resource,
  onChanged,
}: {
  resource: Document;
  onChanged: () => void;
}) {
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const t = assetMessages[useShell((state) => state.locale)];
  const [variant, setVariant] = useState('');
  const [references, setReferences] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const scope = { scopeKind: 'collection' as const, collectionKey: resource.collection };
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {[
          [t.documentId, resource.id],
          [t.collection, resource.collection],
          [t.revision, resource.revision],
          [t.version, resource.versionId],
        ].map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {!resource.trashedAt && resource.file ? (
        <>
          <NativeSelect
            aria-label={t.variants}
            value={variant}
            onChange={(event) => setVariant(event.currentTarget.value)}
          >
            <option value="">{t.original}</option>
            {resource.file.objects
              .filter((object) => object.name !== 'original')
              .map((object) => (
                <option key={object.name} value={object.name}>
                  {object.name} · {object.width} × {object.height}
                </option>
              ))}
          </NativeSelect>
          <AssetPreview
            target={{
              kind: 'document',
              collection: resource.collection,
              id: resource.id,
              versionId: resource.versionId,
              mode: 'editing',
              ...(variant ? { variant } : {}),
            }}
            label={resource.file.filename}
            manifest={resource.file}
          />
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!resource.trashedAt ? (
          <Button
            onClick={() =>
              navigation.push(`/dashboard/collections/${resource.collection}/${resource.id}`)
            }
          >
            {t.openDocument}
          </Button>
        ) : access.can('documents.restoreTrash', scope) ? (
          <Button onClick={() => setRestoring(true)}>{t.restore}</Button>
        ) : null}
        {access.can('resources.references', scope) ? (
          <Button variant="outline" onClick={() => setReferences(!references)}>
            {t.references}
          </Button>
        ) : null}
      </div>
      {references ? <ResourceReferences collection={resource.collection} id={resource.id} /> : null}
      {restoring ? (
        <ResourceRestoreDialog
          resource={resource}
          onClose={() => setRestoring(false)}
          onRestored={onChanged}
        />
      ) : null}
    </div>
  );
}
