'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, Input, PasswordInput } from '@new-cms/ui/forms';
import { LabSection } from './lab-section';

export function LoginExample() {
  const t = useTranslations('inputs');
  const [validation, setValidation] = useState<'idle' | 'valid' | 'invalid'>('idle');
  function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation(event.currentTarget.reportValidity() ? 'valid' : 'invalid');
  }
  return (
    <LabSection title={t('login')} description={t('loginDescription')}>
      <div className="mx-auto w-full max-w-[370px] space-y-6 py-4">
        <p className="text-center text-xl font-semibold tracking-tight">OneAster</p>
        <form
          aria-label={t('login')}
          method="get"
          action="/ui/inputs"
          onSubmit={validate}
          onChange={() => setValidation('idle')}
          className="space-y-4"
        >
          <Field id="login-example-email" name="" label={t('email')} required>
            <Input type="email" autoComplete="off" />
          </Field>
          <Field id="login-example-password" name="" label={t('password')} required>
            <PasswordInput
              autoComplete="off"
              showLabel={t('showPassword')}
              hideLabel={t('hidePassword')}
            />
          </Field>
          <Button type="submit" className="w-full">
            {t('validate')}
          </Button>
        </form>
        {validation !== 'idle' && (
          <Banner tone={validation === 'valid' ? 'info' : 'error'}>
            {t(validation === 'valid' ? 'validated' : 'loginInvalid')}
          </Banner>
        )}
      </div>
    </LabSection>
  );
}
