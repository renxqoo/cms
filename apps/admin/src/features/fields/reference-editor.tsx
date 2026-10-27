'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { relationshipKey } from '../../components/cms/relationship-types';
import type {
  RelationshipValue,
  RelationshipOption,
} from '../../components/cms/relationship-types';
import type { FieldServices, ReferenceEditorRequest, ReferenceValue } from './types';

interface Input {
  collectionKeys: readonly string[];
  value: readonly ReferenceValue[];
  onChange: (value: ReferenceValue[]) => void;
  onResolved: (rows: RelationshipOption[]) => void;
  multiple: boolean;
  maxRows: number;
  readOnly: boolean;
  active: boolean;
  locale: string;
  sourcePath: string;
  filterOptions: boolean;
  services: FieldServices;
}
interface Session {
  input: Input | null;
  active: AbortController | null;
}

function mayAttach(input: Input, value: ReferenceValue) {
  return input.active && !input.readOnly && input.collectionKeys.includes(value.collection);
}
async function completeReference(session: Session, value: ReferenceValue): Promise<boolean> {
  const { input } = session;
  if (!input || !mayAttach(input, value)) return false;
  session.active?.abort();
  const controller = new AbortController();
  session.active = controller;
  const eligible = await input.services
    .searchReferences({
      collections: input.collectionKeys,
      collection: value.collection,
      query: '',
      id: value.id,
      page: 1,
      locale: input.locale,
      sourcePath: input.sourcePath,
      filterOptions: input.filterOptions,
      signal: controller.signal,
    })
    .catch(() => null);
  if (session.active === controller) session.active = null;
  const current = session.input;
  if (
    controller.signal.aborted ||
    !current ||
    !mayAttach(current, value) ||
    !eligible?.rows.some((row) => relationshipKey(row) === relationshipKey(value))
  )
    return false;
  current.onResolved(eligible.rows);
  if (current.value.some((entry) => relationshipKey(entry) === relationshipKey(value))) return true;
  if (current.multiple && current.value.length >= current.maxRows) return false;
  current.onChange(current.multiple ? [...current.value, value] : [value]);
  return true;
}
function referenceSession() {
  const session: Session = { input: null, active: null };
  return {
    update(input: Input) {
      if (
        session.input?.services.referenceContextKey !== input.services.referenceContextKey ||
        session.input?.locale !== input.locale ||
        !input.active ||
        input.readOnly
      )
        session.active?.abort();
      session.input = input;
    },
    complete: (value: ReferenceValue) => completeReference(session, value),
    dispose() {
      session.active?.abort();
      session.active = null;
      session.input = null;
    },
  };
}
function ReferenceEditorHost({
  render,
  request,
}: {
  render: NonNullable<FieldServices['renderReferenceEditor']>;
  request: ReferenceEditorRequest;
}) {
  return render(request);
}

export function useReferenceEditor(input: Input) {
  const [session] = useState(referenceSession);
  const [editing, setEditing] = useState<{ collection: string; id: string | null } | null>(null);
  useEffect(() => {
    session.update(input);
  }, [session, input]);
  useEffect(() => () => session.dispose(), [session]);
  const target = input.services.collections.find(
    (collection) => collection.id === editing?.collection,
  );
  const locale = target?.locales?.includes(input.locale)
    ? input.locale
    : (target?.defaultLocale ?? input.locale);
  const render = input.services.renderReferenceEditor;
  const element: ReactNode =
    editing && input.active && render ? (
      <ReferenceEditorHost
        render={render}
        request={{
          ...editing,
          locale,
          onComplete: session.complete,
          onClose: () => setEditing(null),
        }}
      />
    ) : null;
  return {
    element,
    ports: render
      ? {
          onCreate: (collection: string) => setEditing({ collection, id: null }),
          onEdit: (value: RelationshipValue) =>
            setEditing({ collection: value.collection, id: value.id }),
          canCreate: (collection: string) =>
            input.services.canEditReference?.(collection, 'create') === true,
          canEdit: (value: RelationshipValue) =>
            input.services.canEditReference?.(value.collection, 'update') === true,
        }
      : {},
  };
}
