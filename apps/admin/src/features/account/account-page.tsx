'use client';

import { UserRoundIcon } from 'lucide-react';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import type { Me } from '../../contracts/auth';
import { accountMessages } from './account-messages';
import { ProfileForm } from './profile-form';
import { PasswordChangeForm } from './password-change-form';

export function AccountPage({ principal }: { principal: Me }) {
  const t = accountMessages[useShell((state) => state.locale)];
  return (
    <ClientInteractionBoundary className="flex min-w-0 flex-col gap-4 md:gap-6">
      <PageHeader title={t.title} description={t.description} icon={<UserRoundIcon />} />
      <div className="max-w-3xl space-y-5">
        <ProfileForm principal={principal} messages={t} />
        <PasswordChangeForm messages={t} />
      </div>
    </ClientInteractionBoundary>
  );
}
