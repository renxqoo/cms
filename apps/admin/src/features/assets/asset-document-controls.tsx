'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Dropzone } from '../../components/cms/dropzone';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import type { OperationScope } from '../access-control/controller';
import type { ImageRecipe } from '../../contracts/assets';
import type { AssetDocumentControlsProps } from './document-asset-types';
import type { AssetWorkController, AssetWorkOperation } from './document-work-types';
import { createAssetDocumentWork } from './document-work';
import { AssetWorkView } from './asset-work-view';
import { ImageRecipeDialog } from './image-recipe-dialog';
import { assetMessages } from './messages';

export function AssetDocumentControls(props: AssetDocumentControlsProps) {
  const access = useAccessControl();
  const t = assetMessages[useShell((state) => state.locale)];
  const [work, setWork] = useState<AssetWorkController | null>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const active = useRef<AssetWorkController | null>(null);
  const live = useRef({ access, readOnly: props.readOnly });
  useLayoutEffect(() => {
    live.current = { access, readOnly: props.readOnly };
  }, [access, props.readOnly]);
  useEffect(() => () => active.current?.dispose(), []);
  const scope = { scopeKind: 'collection' as const, collectionKey: props.collection };
  const canReplace =
    access.phase === 'ready' &&
    [
      'documents.update',
      'assets.createUpload',
      'assets.writeUpload',
      'assets.completeUpload',
      'assets.readUpload',
      'assets.cancelUpload',
    ].every((operation) => access.can(operation, scope));
  const canProcess =
    access.phase === 'ready' &&
    [
      'assets.reprocess',
      'content.getJob',
      'assets.readUpload',
      'assets.cancelUpload',
      'assets.download',
    ].every((operation) => access.can(operation, scope));
  function can(operation: AssetWorkOperation) {
    return hasPermission(live.current, scope, operation);
  }
  function permission(operation: AssetWorkOperation) {
    return hasPermission({ access, readOnly: props.readOnly }, scope, operation);
  }
  function replace(files: File[]) {
    const [file] = files;
    if (!file || props.busy || props.readOnly || !canReplace) return;
    const lease = props.begin('replace');
    if (!lease) return;
    active.current?.dispose();
    const next = createAssetDocumentWork({
      ...props,
      lease,
      can,
      kind: 'replace',
      file,
      report: access.reportResult,
    });
    active.current = next;
    setWork(next);
    next.start();
  }
  function process(recipe: ImageRecipe) {
    if (props.busy || props.readOnly || !canProcess) return;
    const lease = props.begin('reprocess');
    if (!lease) return;
    active.current?.dispose();
    const next = createAssetDocumentWork({
      ...props,
      lease,
      can,
      kind: 'reprocess',
      recipe,
      report: access.reportResult,
    });
    active.current = next;
    setWork(next);
    next.start();
  }
  const feedback = work ? (
    <AssetWorkView work={work} collection={props.collection} can={permission} />
  ) : null;
  return (
    <section className="space-y-4" aria-label={t.replace}>
      {!props.readOnly && canReplace ? (
        <Dropzone
          limits={{ maxFiles: 1, maxBytes: props.budget.maxBytes, accept: props.budget.mimeTypes }}
          labels={{
            label: t.replace,
            description: t.drop,
            choose: t.replace,
            count: t.count,
            size: t.size,
            type: t.type,
          }}
          disabled={props.busy}
          onFiles={replace}
          onReject={() => {}}
        />
      ) : null}
      {!props.readOnly && canProcess && props.manifest?.mimeType.startsWith('image/') ? (
        <Button variant="outline" disabled={props.busy} onClick={() => setRecipeOpen(true)}>
          {t.reprocess}
        </Button>
      ) : null}
      {!recipeOpen ? feedback : null}
      {recipeOpen && props.manifest ? (
        <ImageRecipeDialog
          key={props.manifest.id}
          target={{
            kind: 'document',
            collection: props.collection,
            id: props.documentId,
            versionId: props.versionId,
            mode: 'editing',
          }}
          manifest={props.manifest}
          budget={props.budget}
          pending={props.busy}
          locked={props.busy}
          onClose={() => setRecipeOpen(false)}
          onRun={process}
          feedback={feedback}
        />
      ) : null}
    </section>
  );
}

function hasPermission(
  current: { access: ReturnType<typeof useAccessControl>; readOnly: boolean | undefined },
  scope: OperationScope,
  operation: AssetWorkOperation,
) {
  const reading = operation === 'content.getJob' || operation === 'assets.readUpload';
  return (
    current.access.phase === 'ready' &&
    (reading || !current.readOnly) &&
    current.access.can(operation, scope)
  );
}
