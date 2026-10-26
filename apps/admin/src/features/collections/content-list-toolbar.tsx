'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { ColumnSelector } from '@new-cms/ui/data';
import { SearchBar, NativeSelect } from '@new-cms/ui/forms';
import { ListToolbar } from '@new-cms/ui/layout';
import { folderListSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { collectionScope } from './content-policy';
import { flattenFolders } from './folder-directory';
import { documentColumnOptions } from './content-list-columns';
import type { ContentQuery } from './content-query';
import type { ContentMessages } from './content-messages';
export function ContentListToolbar({
  collection,
  query,
  change,
  onFilters,
  messages: t,
}: {
  collection: Collection;
  query: ContentQuery;
  change: (changes: Partial<ContentQuery>) => void;
  onFilters: () => void;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const folders = useApiQuery({
    operation: 'folders.list',
    query: { collection: collection.key },
    response: folderListSchema,
    enabled: access.can('folders.list', collectionScope(collection.key)),
  });
  return (
    <ListToolbar>
      <ContentSearch key={query.q} value={query.q} onSearch={(q) => change({ q })} messages={t} />
      <div className="flex flex-wrap gap-2">
        <NativeSelect
          aria-label={t.locale}
          value={query.locale}
          onChange={(event) => change({ locale: event.target.value })}
        >
          {collection.locales.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t.status}
          value={query.trashed ? 'trash' : query.mode}
          onChange={(event) =>
            change({
              trashed: event.target.value === 'trash',
              mode: event.target.value === 'published' ? 'published' : 'editing',
            })
          }
        >
          <option value="editing">{t.live}</option>
          {collection.capabilities.publication ? (
            <option value="published">{t.publishedView}</option>
          ) : null}
          <option value="trash">{t.trash}</option>
        </NativeSelect>
        <NativeSelect
          aria-label={t.folder}
          value={query.folderId === undefined ? 'all' : String(query.folderId)}
          disabled={folders.phase !== 'ready'}
          onChange={(event) => change({ folderId: folderFilter(event.target.value) })}
        >
          <option value="all">{t.noFolderFilter}</option>
          <option value="null">{t.rootFolder}</option>
          {flattenFolders(folders.data?.rows ?? []).map((folder) => (
            <option key={folder.id} value={folder.id}>
              {'—'.repeat(folder.depth)} {folder.name}
            </option>
          ))}
        </NativeSelect>
        <Button variant="outline" onClick={onFilters}>
          {t.filters}
        </Button>
        <ColumnSelector
          columns={documentColumnOptions(collection, t).map((option) => ({
            ...option,
            locked: option.key === 'id',
          }))}
          selectedKeys={query.columns}
          onChange={(columns) => change({ columns })}
          label={t.columns}
        />
      </div>
    </ListToolbar>
  );
}
function folderFilter(value: string): string | null | undefined {
  if (value === 'all') return undefined;
  return value === 'null' ? null : value;
}
function ContentSearch({
  value,
  onSearch,
  messages: t,
}: {
  value: string;
  onSearch: (value: string) => void;
  messages: ContentMessages;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <SearchBar
      value={draft}
      onValueChange={setDraft}
      onSearch={onSearch}
      mode={{ type: 'submit' }}
      label={t.searchLabel}
      searchLabel={t.search}
      clearLabel={t.clearSearch}
      placeholder={t.searchPlaceholder}
    />
  );
}
