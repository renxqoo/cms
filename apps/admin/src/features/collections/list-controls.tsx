'use client';
import { UiFieldFilters } from './ui-field-filters';
import { ListFilter } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { ColumnSelector } from '@new-cms/ui/data';
import { Popover, PopoverTrigger, PopoverContent } from '@new-cms/ui/overlays';
import type { Collection } from '../../contracts/content';
import type { FolderTree } from '../../contracts/folders';
import type { DocumentQuery } from './query';
import type { ContentMessages } from './messages';
import { flattenFolders } from './folders';
import { FilterBuilder } from './filter-builder';
import { SortBuilder } from './sort-builder';
import { GroupingControl } from './grouping-control';
import { queryFilter } from './query';
import { queryMessages } from './query-messages';
import { useShell } from '../../components/shell/shell-provider';
interface ListControlsProps {
  collection: Collection;
  query: DocumentQuery;
  folders: readonly FolderTree[] | null;
  visible: readonly string[];
  setVisible: (updater: (current: string[]) => string[]) => void;
  t: ContentMessages;
  change: (changes: Partial<DocumentQuery>) => void;
}
export function DocumentListControls({
  collection,
  query,
  folders,
  visible,
  setVisible,
  t,
  change,
}: ListControlsProps) {
  const locale = useShell((state) => state.locale);
  const labels = queryMessages[locale];
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Button variant="outline" onClick={() => change({ trashed: !query.trashed })}>
          {query.trashed ? t.active : t.trash}
        </Button>
        <Field id="list-locale" label={t.locale}>
          <NativeSelect
            value={query.locale}
            onChange={(event) => change({ locale: event.currentTarget.value })}
          >
            {collection.locales.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {collection.mode === 'drafts' && !query.trashed ? (
          <Field id="list-mode" label={t.mode}>
            <NativeSelect
              value={query.mode}
              onChange={(event) => change({ mode: event.currentTarget.value })}
            >
              <option value="editing">{t.editing}</option>
              <option value="published">{t.published}</option>
            </NativeSelect>
          </Field>
        ) : null}
        {folders ? (
          <Field id="list-folder" label={t.folder}>
            <NativeSelect
              value={query.folderId === null ? 'root' : (query.folderId ?? 'all')}
              onChange={(event) =>
                change({
                  folderId: selectedFolder(event.currentTarget.value),
                })
              }
            >
              <option value="all">{t.allFolders}</option>
              <option value="root">{t.rootFolder}</option>
              {flattenFolders(folders).map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {'— '.repeat(folder.depth)}
                  {folder.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline">
                <ListFilter aria-hidden="true" />
                {t.filters}
                {query.where ? ' ·' : ''}
              </Button>
            }
          />
          <PopoverContent className="max-h-[80vh] w-[min(48rem,calc(100vw-2rem))] overflow-auto">
            <FilterBuilder
              key={query.where}
              value={queryFilter(query, collection).where}
              collection={collection}
              t={t}
              onApply={(where) => change({ where: where ? JSON.stringify(where) : '' })}
            />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline">
                {labels.sort} · {query.sort.length}
              </Button>
            }
          />
          <PopoverContent className="max-h-[80vh] w-[min(40rem,calc(100vw-2rem))] overflow-auto">
            <SortBuilder
              key={JSON.stringify(query.sort)}
              collection={collection}
              value={query.sort}
              onApply={(sort) => change({ sort })}
            />
          </PopoverContent>
        </Popover>
        <ColumnSelector
          columns={collection.fields
            .filter((field) => !field.disabled?.column)
            .map((field) => ({ key: field.path, label: field.label }))}
          selectedKeys={visible}
          onChange={(keys) => setVisible(() => keys)}
          label={t.columns}
        />
        <GroupingControl collection={collection} query={query} change={change} />
      </div>
      <UiFieldFilters collection={collection} query={query} change={change} />
    </>
  );
}
function selectedFolder(value: string) {
  if (value === 'root') return null;
  return value === 'all' ? undefined : value;
}
