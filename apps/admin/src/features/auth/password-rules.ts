export type PasswordError = 'passwordTooShort' | 'passwordTooLong';
export interface PasswordErrors {
  newPassword?: PasswordError | 'invalidInput' | undefined;
  confirmPassword?: 'mismatch' | undefined;
}

export function checkNewPassword(value: string): PasswordError | undefined {
  const { length } = Array.from(value);
  if (length < 15) return 'passwordTooShort';
  if (length > 128 || new TextEncoder().encode(value).byteLength > 512) return 'passwordTooLong';
  return undefined;
}

export function formString(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

export function passwordConfirmation(data: FormData) {
  const newPassword = formString(data, 'newPassword');
  const errors: PasswordErrors = {};
  const invalid = checkNewPassword(newPassword);
  if (invalid) errors.newPassword = invalid;
  if (newPassword !== formString(data, 'confirmPassword')) errors.confirmPassword = 'mismatch';
  return { newPassword, errors, valid: Object.keys(errors).length === 0 };
}

export function focusPasswordError(form: HTMLFormElement, errors: PasswordErrors) {
  const field = errors.newPassword ? 'newPassword' : 'confirmPassword';
  const control = form.elements.namedItem(field);
  if (control instanceof HTMLElement) control.focus();
}
