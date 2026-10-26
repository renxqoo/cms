'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/client';
import { emptyResponseSchema } from '../../contracts/auth';
import { navigationListSchema } from '../../contracts/access';
import type { NavigationNode } from '../../contracts/access';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { flattenNavigation } from './navigation-model';
import { navigationMessages } from './navigation-messages';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

export function NavigationDeleteDialog({
  node,
  onClose,
  onDeleted,
}: {
  node: NavigationNode;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = navigationMessages[locale];
  const access = useAccessControl();
  const [current, setCurrent] = useState(node);
  const [latest, setLatest] = useState<NavigationNode | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const [locked, setLocked] = useState(false);
  async function remove() {
    if (
      active.current ||
      locked ||
      !access.can('navigation.delete') ||
      !access.can('navigation.list')
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    const result = await requestApi({
      operation: 'navigation.delete',
      params: { id: current.id },
      query: { version: current.version },
      response: emptyResponseSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (result.ok) {
      access.refresh();
      onDeleted();
    } else {
      setLocked(result.uncertain || result.error.code === 'version_conflict');
      setError(result);
    }
  }
  async function read() {
    if (active.current || !access.can('navigation.list')) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setLatest(null);
    const result = await requestApi({
      operation: 'navigation.list',
      response: navigationListSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (!result.ok) return setError(result);
    const found = flattenNavigation(result.data.rows).find(
      ({ node: candidate }) => candidate.id === current.id,
    );
    if (found) setLatest(found.node);
    else {
      access.refresh();
      onDeleted();
    }
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={`${t.remove}: ${node.name}`}
      description={t.deleteDescription}
      onSubmit={() => void remove()}
      pending={pending}
      locked={locked}
      disabled={locked || !access.can('navigation.delete') || !access.can('navigation.list')}
      destructive
      submitLabel={t.confirmDelete}
      actions={
        locked ? (
          <Button
            variant="outline"
            disabled={pending || !access.can('navigation.list')}
            onClick={() => void read()}
          >
            {t.readCurrent}
          </Button>
        ) : null
      }
      feedback={
        <>
          <ManagementFeedback error={error} />
          {latest ? (
            <Banner className="space-y-2">
              <p>
                {t.current}: {latest.version}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  if (active.current || !access.can('navigation.list')) return;
                  setCurrent(latest);
                  setLocked(false);
                  setLatest(null);
                  setError(null);
                }}
              >
                {t.adopt}
              </Button>
            </Banner>
          ) : null}
        </>
      }
    >
      <p className="break-words">{current.name}</p>
    </ManagementDialog>
  );
}
