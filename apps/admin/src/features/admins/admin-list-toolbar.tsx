'use client';

import { useState } from 'react';
import { NativeSelect, SearchBar } from '@new-cms/ui/forms';
import type { AdminListQuery, AdminQueryChanges } from './admins-query';
import type { AdminsMessages } from './admins-messages';

function AdminSearch({
  query,
  change,
  messages: t,
}: {
  query: string;
  change: (changes: AdminQueryChanges) => void;
  messages: AdminsMessages;
}) {
  const [value, setValue] = useState(query);
  return (
    <SearchBar
      value={value}
      onValueChange={setValue}
      onSearch={(q) => change({ q })}
      mode={{ type: 'submit' }}
      label={t.search}
      searchLabel={t.searchSubmit}
      clearLabel={t.clear}
      placeholder={t.searchPlaceholder}
    />
  );
}

export function AdminListToolbar({
  query,
  change,
  messages: t,
}: {
  query: AdminListQuery;
  change: (changes: AdminQueryChanges) => void;
  messages: AdminsMessages;
}) {
  return (
    <>
      <AdminSearch key={query.q} query={query.q} change={change} messages={t} />
      <div className="flex w-full gap-2 sm:w-auto">
        <NativeSelect
          aria-label={t.filterStatus}
          value={query.status}
          className="min-w-0 flex-1 sm:w-32"
          onChange={(event) => {
            const { value } = event.target;
            change({
              status:
                value === 'active' || value === 'disabled' || value === 'archived' ? value : 'all',
            });
          }}
        >
          <option value="all">{t.all}</option>
          <option value="active">{t.active}</option>
          <option value="disabled">{t.disabled}</option>
          <option value="archived">{t.archived}</option>
        </NativeSelect>
        <NativeSelect
          aria-label={t.filterActivation}
          value={query.activation}
          className="min-w-0 flex-1 sm:w-36"
          onChange={(event) => {
            const { value } = event.target;
            change({ activation: value === 'pending' || value === 'activated' ? value : 'all' });
          }}
        >
          <option value="all">{t.all}</option>
          <option value="pending">{t.pending}</option>
          <option value="activated">{t.activated}</option>
        </NativeSelect>
      </div>
    </>
  );
}
