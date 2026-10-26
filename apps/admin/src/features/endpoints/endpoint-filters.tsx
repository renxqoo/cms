import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Input, NativeSelect } from '@new-cms/ui/forms';
import type { EndpointQuery } from './endpoint-model';
import { endpointMessages } from './endpoint-messages';

export function EndpointFilters({
  query,
  change,
  locale,
}: {
  query: EndpointQuery;
  change: (changes: Partial<EndpointQuery>) => void;
  locale: 'zh' | 'en';
}) {
  const [module, setModule] = useState(query.module ?? '');
  const [access, setAccess] = useState(query.accessKind ?? '');
  const t = endpointMessages[locale];
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        change({
          module: module || undefined,
          accessKind:
            access === 'public' ||
            access === 'authenticated' ||
            access === 'security' ||
            access === 'permission'
              ? access
              : undefined,
        });
      }}
    >
      <Input
        aria-label={t.module}
        placeholder={t.module}
        maxLength={32}
        value={module}
        onChange={(event) => setModule(event.target.value)}
        className="w-full sm:w-40"
      />
      <NativeSelect
        aria-label={t.access}
        value={access}
        onChange={(event) => setAccess(event.target.value)}
      >
        <option value="">{t.all}</option>
        {(['public', 'authenticated', 'security', 'permission'] as const).map((value) => (
          <option key={value} value={value}>
            {t[value]}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="outline">
        {t.apply}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setModule('');
          setAccess('');
          change({ module: undefined, accessKind: undefined });
        }}
      >
        {t.clear}
      </Button>
    </form>
  );
}
