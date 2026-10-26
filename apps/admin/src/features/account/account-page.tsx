'use client';

import { UserRoundIcon } from 'lucide-react';
import { PageHeader } from '@new-cms/ui/layout';
import { Button } from '@new-cms/ui/actions';
import { AppLink } from '../../components/shell/navigation/app-link';
import { getAdminRoute } from '../../config/admin-routes';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import type { Me } from '../../contracts/auth';
import { accountMessages } from './account-messages';
import { ProfileForm } from './profile-form';
import { PasswordChangeForm } from './password-change-form';

export function AccountPage({ principal }: { principal: Me }) {
  const locale = useShell((state) => state.locale);
  const t = accountMessages[locale];
  return (
    <ClientInteractionBoundary className="flex min-w-0 flex-col gap-4 md:gap-6">
      <PageHeader title={t.title} description={t.description} icon={<UserRoundIcon />} />
      <div className="max-w-3xl space-y-5">
        <Button
          variant="outline"
          render={<AppLink href={getAdminRoute('credentials').path} prefetch={false} />}
        >
          {getAdminRoute('credentials').label[locale]}
        </Button>
        <ProfileForm principal={principal} messages={t} />
        <PasswordChangeForm messages={t} />
      </div>
    </ClientInteractionBoundary>
  );
}
