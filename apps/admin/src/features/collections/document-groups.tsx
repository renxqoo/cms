'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Card, CardContent } from '@new-cms/ui/layout';
import { Banner } from '@new-cms/ui/feedback';
import type { DataTableColumn } from '@new-cms/ui/data';
import { useShell } from '../../components/shell/shell-provider';
import type { Collection } from '../../contracts/content';
import type { DocumentGroups } from '../../contracts/document-groups';
import type { Document } from '../../contracts/documents';
import {
  ManagementList,
  ManagementSearch,
  ManagementPagination,
} from '../management-shared/management-list';
import { labelledOptions } from '../fields/option-labels';
import { groupingMessages } from './grouping-messages';
import type { DocumentQuery } from './query';

interface GroupsProps {
  groups: DocumentGroups | null;
  collection: Collection;
  query: DocumentQuery;
  change: (patch: Partial<DocumentQuery>) => void;
  columns: (rows: Document[]) => readonly DataTableColumn<Document>[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function groupLabel(
  group: DocumentGroups['rows'][number],
  props: GroupsProps,
  locale: 'zh' | 'en',
): string {
  if (group.label) return group.label;
  if (group.value === null) return groupingMessages[locale].noValue;
  const field = props.collection.fields.find(
    (candidate) => candidate.path === props.query.groupBy?.field,
  );
  if (typeof group.value === 'string' && field?.options)
    return (
      labelledOptions(field.options, locale).find((option) => option.value === group.value)
        ?.label ?? group.value
    );
  if (typeof group.value === 'object') return JSON.stringify(group.value);
  return String(group.value);
}

function DocumentGroup({
  group,
  ...props
}: GroupsProps & { group: DocumentGroups['rows'][number] }) {
  const locale = useShell((state) => state.locale);
  const t = groupingMessages[locale];
  const [expanded, setExpanded] = useState(true);
  const title = groupLabel(group, props, locale);
  function change(page: number, pageSize = group.documents.pageSize) {
    const visible = new Set(props.groups?.rows.map((row) => row.key));
    const paging = Object.fromEntries(
      Object.entries(props.query.queryByGroup ?? {}).filter(([key]) => visible.has(key)),
    );
    props.change({
      queryByGroup: { ...paging, [group.key]: { page, pageSize } },
    });
  }
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <Button
          variant="ghost"
          aria-expanded={expanded}
          aria-label={`${expanded ? t.collapse : t.expand}: ${title}`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDownIcon aria-hidden="true" />
          ) : (
            <ChevronRightIcon aria-hidden="true" />
          )}
          <span className="break-words text-left">{title}</span>
          <span className="text-muted-foreground">{group.documents.total}</span>
        </Button>
        {expanded ? (
          <ManagementList
            columns={props.columns(group.documents.rows)}
            rows={group.documents.rows}
            rowKey={(row) => row.id}
            page={group.documents.page}
            pageSize={group.documents.pageSize}
            pageSizeOptions={props.collection.admin?.pagination?.limits}
            total={group.documents.total}
            loading={props.loading}
            error={props.error}
            onPageChange={(page) => change(page)}
            onPageSizeChange={(size) => change(1, size)}
            onRetry={props.reload}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function GroupedStatus(props: GroupsProps) {
  const locale = useShell((state) => state.locale);
  return (
    <>
      {props.error ? (
        <Banner tone="error">
          <span>{props.error}</span>
          <Button variant="outline" onClick={props.reload}>
            {locale === 'zh' ? '重试' : 'Try again'}
          </Button>
        </Banner>
      ) : null}
      {props.loading && !props.groups ? (
        <p role="status">{locale === 'zh' ? '正在加载…' : 'Loading…'}</p>
      ) : null}
    </>
  );
}

export function DocumentGroupedTables(props: GroupsProps) {
  const locale = useShell((state) => state.locale);
  const t = groupingMessages[locale];
  return (
    <div className="space-y-4">
      <ManagementSearch
        key={props.query.q}
        value={props.query.q}
        onSearch={(q) => props.change({ q })}
      />
      <GroupedStatus {...props} />
      {props.groups?.rows.map((group) => (
        <DocumentGroup key={group.key} {...props} group={group} />
      ))}
      {!props.loading && props.groups?.rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t.empty}</p>
      ) : null}
      <ManagementPagination
        locale={locale}
        props={{
          page: props.query.page,
          pageSize: props.query.pageSize,
          pageSizeOptions: props.collection.admin?.pagination?.limits,
          total: props.groups?.total ?? 0,
          totalLabel: `${props.groups?.total ?? 0} ${t.groups}`,
          loading: props.loading,
          error: props.error,
          onPageChange: (page) => props.change({ page }),
          onPageSizeChange: (pageSize) => props.change({ pageSize }),
        }}
      />
    </div>
  );
}
