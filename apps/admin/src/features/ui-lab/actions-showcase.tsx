'use client';

import { useState } from 'react';
import { InfoIcon, SearchIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import { CopyButton } from '@new-cms/ui/feedback';
import { Checkbox } from '@new-cms/ui/forms';
import { Hamburger, Icon, Link } from '@new-cms/ui/navigation';
import { AppLink } from '../../components/shell/navigation/app-link';
import { LabPage } from './lab-page';
import { LabOutput, LabSection } from './lab-section';

export function ActionsShowcase() {
  const t = useTranslations('actions');
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <LabPage category="actions">
      <LabSection title={t('buttons')} description={t('buttonsDescription')}>
        <div className="flex flex-wrap gap-2">
          {(['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const).map(
            (variant) => (
              <Button
                key={variant}
                variant={variant}
                onClick={() => setCount((value) => value + 1)}
              >
                {t(
                  variant === 'default'
                    ? 'defaultButton'
                    : variant === 'link'
                      ? 'linkButton'
                      : variant,
                )}
              </Button>
            ),
          )}
          <Button disabled>{t('disabled')}</Button>
          <Button busy={busy} variant="outline" onClick={() => setCount((value) => value + 1)}>
            {t('busy')}
          </Button>
          <Button variant="ghost" aria-pressed={busy} onClick={() => setBusy(!busy)}>
            {t('toggleBusy')}
          </Button>
        </div>
        <LabOutput label={t('buttons')} value={t('events', { count })} />
      </LabSection>
      <LabSection title={t('clipboard')} description={t('clipboardDescription')}>
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton
            value="OneAster"
            label={t('copy')}
            copiedLabel={t('copied')}
            errorLabel={t('copyError')}
            feedbackDurationMs={2000}
            {...(denied
              ? { writeText: () => Promise.reject(new Error('Synthetic clipboard denial')) }
              : {})}
          />
          <Checkbox label={t('denied')} checked={denied} onCheckedChange={setDenied} />
        </div>
      </LabSection>
      <LabSection title={t('navigation')} description={t('navigationDescription')}>
        <Hamburger
          expanded={menuOpen}
          onToggle={() => setMenuOpen(!menuOpen)}
          label={t('toggleMenu')}
        />
        {menuOpen && (
          <nav aria-label={t('toggleMenu')}>
            <ul className="flex flex-wrap gap-4 text-sm">
              <li>
                <AppLink href="/ui/lists" className="underline underline-offset-4">
                  {t('lists')}
                </AppLink>
              </li>
              <li>
                <AppLink href="/ui/inputs" className="underline underline-offset-4">
                  {t('inputs')}
                </AppLink>
              </li>
            </ul>
          </nav>
        )}
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            href="https://payloadcms.com/docs/ui-components/overview"
            target="_blank"
            className="underline underline-offset-4"
          >
            {t('external')}
          </Link>
          <Link href="javascript:alert(1)">{t('blocked')}</Link>
        </div>
      </LabSection>
      <LabSection title={t('icons')} description={t('iconsDescription')}>
        <div className="flex items-center gap-4">
          <Icon icon={SearchIcon} label={t('searchIcon')} />
          <Icon icon={InfoIcon} label={t('information')} size="lg" />
          <Icon icon={SearchIcon} />
        </div>
      </LabSection>
    </LabPage>
  );
}
