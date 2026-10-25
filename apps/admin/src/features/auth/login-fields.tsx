import { LockIcon, MailIcon } from 'lucide-react';
import { Field, Input, PasswordInput } from '@new-cms/ui/forms';
import type { AuthMessages } from './auth-messages';
import type { LoginInputErrors, LoginValues } from './login-input';

export function LoginFields({
  values,
  errors,
  disabled,
  change,
  messages: t,
}: {
  values: LoginValues;
  errors: LoginInputErrors;
  disabled: boolean;
  change: (field: keyof LoginValues, value: string) => void;
  messages: AuthMessages;
}) {
  return (
    <div className="space-y-6">
      <Field
        id="login-email"
        name="email"
        label={t.email}
        error={errors.email && t[errors.email]}
        required
      >
        <div className="relative">
          <MailIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 z-10 size-4 text-muted-foreground"
          />
          <Input
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="admin@example.com"
            className="h-11 pl-9"
            disabled={disabled}
            value={values.email}
            onChange={(event) => change('email', event.target.value)}
          />
        </div>
      </Field>
      <Field
        id="login-password"
        name="password"
        label={t.password}
        error={errors.password && t[errors.password]}
        required
      >
        <div className="relative">
          <LockIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 z-10 size-4 text-muted-foreground"
          />
          <PasswordInput
            autoComplete="current-password"
            placeholder={t.passwordPlaceholder}
            className="h-11 pl-9"
            showLabel={t.showPassword}
            hideLabel={t.hidePassword}
            disabled={disabled}
            value={values.password}
            onChange={(event) => change('password', event.target.value)}
          />
        </div>
      </Field>
    </div>
  );
}
