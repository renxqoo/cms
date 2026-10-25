import { Field, PasswordInput } from '@new-cms/ui/forms';
import type { PasswordErrors } from './password-rules';
import type { RecoveryMessages } from './recovery-messages';

export function PasswordActionFields({
  disabled,
  errors,
  messages: t,
}: {
  disabled: boolean;
  errors: PasswordErrors;
  messages: RecoveryMessages;
}) {
  return (
    <div className="space-y-6">
      <Field
        id="action-new-password"
        name="newPassword"
        label={t.newPassword}
        description={t.passwordHint}
        error={errors.newPassword && t[errors.newPassword]}
        required
      >
        <PasswordInput
          autoComplete="new-password"
          className="h-11"
          disabled={disabled}
          showLabel={t.showPassword}
          hideLabel={t.hidePassword}
        />
      </Field>
      <Field
        id="action-confirm-password"
        name="confirmPassword"
        label={t.confirmPassword}
        error={errors.confirmPassword && t[errors.confirmPassword]}
        required
      >
        <PasswordInput
          autoComplete="new-password"
          className="h-11"
          disabled={disabled}
          showLabel={t.showPassword}
          hideLabel={t.hidePassword}
        />
      </Field>
    </div>
  );
}
