import { formString, passwordConfirmation } from '../auth/password-rules';
import type { PasswordErrors } from '../auth/password-rules';

export interface PasswordChangeErrors extends PasswordErrors {
  currentPassword?: 'currentRequired' | 'currentTooLong' | 'currentIncorrect' | undefined;
}

export function passwordChangeInput(data: FormData) {
  const values = passwordConfirmation(data);
  const currentPassword = formString(data, 'currentPassword');
  const errors: PasswordChangeErrors = { ...values.errors };
  if (!currentPassword) errors.currentPassword = 'currentRequired';
  else if (
    Array.from(currentPassword).length > 128 ||
    new TextEncoder().encode(currentPassword).byteLength > 512
  )
    errors.currentPassword = 'currentTooLong';
  return {
    body: { currentPassword, newPassword: values.newPassword },
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function focusChangePasswordError(form: HTMLFormElement, errors: PasswordChangeErrors) {
  let name = 'confirmPassword';
  if (errors.currentPassword) name = 'currentPassword';
  else if (errors.newPassword) name = 'newPassword';
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLElement) field.focus();
}
