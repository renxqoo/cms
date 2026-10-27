'use client';

import { CollectionIcon } from './list-customization';

import type { DocumentQuery } from './query';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Card, CardContent } from '@new-cms/ui/layout';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import { hierarchyPageSchema } from '../../contracts/hierarchy';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { collectionHref, documentTitle } from './query';
import { hierarchyMessages } from './hierarchy-messages';
import { HierarchyMoveDialog } from './hierarchy-move-dialog';

interface TreeProps {
  collection: Collection;
  locale: string;
  mode: 'editing' | 'published';
  selected: readonly Document[];
  onChanged: () => void;
}
interface BranchProps extends TreeProps {
  parentId: string | null;
  move: (documents: readonly Document[]) => void;
  canMove: boolean;
}

export function HierarchyTree(props: TreeProps) {
  const access = useAccessControl();
  const language = useShell((state) => state.locale);
  const t = hierarchyMessages[language];
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [moving, setMoving] = useState<readonly Document[] | null>(null);
  const scope = { scopeKind: 'collection', collectionKey: props.collection.key } as const;
  const canMove =
    props.mode === 'editing' &&
    access.can('hierarchy.move', scope) &&
    access.can('documents.update', scope);
  if (!props.collection.hierarchy || !access.can('hierarchy.tree', scope)) return null;
  const refresh = () => {
    setEpoch((value) => value + 1);
    props.onChanged();
  };
  return (
    <section className="space-y-3" aria-label={t.tree}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
          <CollectionIcon hierarchy collection={props.collection} />
          {open ? t.hide : t.tree}
        </Button>
        {canMove &&
        props.selected.length > 0 &&
        (!props.collection.disableBulkEdit || props.selected.length === 1) ? (
          <Button variant="outline" onClick={() => setMoving(props.selected)}>
            {t.moveSelected}
          </Button>
        ) : null}
      </div>
      {open ? (
        <Card>
          <CardContent className="overflow-x-auto pt-4">
            <HierarchyBranch
              key={`${epoch}:${props.locale}:${props.mode}`}
              {...props}
              parentId={null}
              move={setMoving}
              canMove={canMove}
            />
          </CardContent>
        </Card>
      ) : null}
      {moving ? (
        <HierarchyMoveDialog
          collection={props.collection}
          locale={props.locale}
          documents={moving}
          onClose={() => setMoving(null)}
          onChanged={refresh}
        />
      ) : null}
    </section>
  );
}

function HierarchyBranch(props: BranchProps) {
  const language = useShell((state) => state.locale);
  const t = hierarchyMessages[language];
  const navigation = useAppNavigation();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const result = useApiQuery({
    operation: 'hierarchy.tree',
    params: { collection: props.collection.key },
    query: {
      locale: props.locale,
      mode: props.mode,
      parentId: props.parentId,
      page,
      pageSize: props.collection.hierarchy?.treeLimit,
    },
    response: hierarchyPageSchema,
  });
  return (
    <div className="min-w-0 space-y-3">
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {result.data?.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : null}
      <ul className="space-y-2">
        {result.data?.rows.map((document) => (
          <li key={document.id} className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  expanded.has(document.id)
                    ? `${t.collapse}: ${documentTitle(document, props.collection)}`
                    : `${t.expand}: ${documentTitle(document, props.collection)}`
                }
                aria-expanded={expanded.has(document.id)}
                onClick={() =>
                  setExpanded((before) => {
                    const next = new Set(before);
                    if (next.has(document.id)) next.delete(document.id);
                    else next.add(document.id);
                    return next;
                  })
                }
              >
                {expanded.has(document.id) ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </Button>
              <Button
                variant="ghost"
                className="h-auto min-w-0 justify-start whitespace-normal break-words text-left"
                onClick={() =>
                  navigation.push(
                    `${collectionHref(props.collection.key, document.id)}?locale=${encodeURIComponent(props.locale)}${props.mode === 'published' ? '&mode=published' : ''}`,
                  )
                }
              >
                <CollectionIcon hierarchy collection={props.collection} small />
                {documentTitle(document, props.collection)}
              </Button>
              {props.canMove ? (
                <Button variant="outline" size="sm" onClick={() => props.move([document])}>
                  {t.move}
                </Button>
              ) : null}
            </div>
            {expanded.has(document.id) ? (
              <div className="ml-3 border-l pl-3 sm:ml-5 sm:pl-5">
                <HierarchyBranch {...props} parentId={document.id} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {result.data && result.data.total > result.data.pageSize ? (
        <div className="flex gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t.previous}
          </Button>
          <span className="self-center text-sm">{page}</span>
          <Button
            variant="outline"
            disabled={page * result.data.pageSize >= result.data.total}
            onClick={() => setPage(page + 1)}
          >
            {t.next}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function DocumentHierarchy(props: {
  collection: Collection;
  query: DocumentQuery;
  selected: readonly Document[];
  onChanged: () => void;
}) {
  if (!props.collection.hierarchy?.injectSidebarTab || props.query.trashed) return null;
  return (
    <HierarchyTree
      collection={props.collection}
      locale={props.query.locale}
      mode={props.query.mode === 'published' ? 'published' : 'editing'}
      selected={props.selected}
      onChanged={props.onChanged}
    />
  );
}
