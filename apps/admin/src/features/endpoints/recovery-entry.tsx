'use client';
import { AppLink } from '../../components/shell/navigation/app-link';
import { useShell } from '../../components/shell/shell-provider';
import { getAdminRoute } from '../../config/admin-routes';
import { useAccessControl } from '../access-control/provider';
import type { ApiFailure } from '../management-shared/query';
import { recoveryMessages } from './recovery-messages';

export function RecoveryEntry({ errors }: { errors: readonly (ApiFailure | null)[] }) {
  const access = useAccessControl();
  const t = recoveryMessages[useShell((state) => state.locale)];
  if (
    !errors.some((error) => error?.status === 403) ||
    !access.can('access.readRecovery') ||
    !access.principal.role.isSuper
  )
    return null;
  return (
    <AppLink
      href={getAdminRoute('recovery').path}
      className="inline-flex rounded-lg border px-3 py-2 text-sm text-primary outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      {t.title}
    </AppLink>
  );
}
