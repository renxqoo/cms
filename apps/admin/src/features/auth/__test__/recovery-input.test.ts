import { expect, it } from 'vitest';
import { fragmentToken } from '../action-token';
import { checkNewPassword, formString, passwordConfirmation } from '../password-rules';

it.each(['', 'a'.repeat(14), '🔐'.repeat(14)])(
  'rejects passwords shorter than fifteen Unicode characters',
  (value) => {
    expect(checkNewPassword(value)).toBe('passwordTooShort');
  },
);

it.each(['a'.repeat(15), '🔐'.repeat(15), '🔐'.repeat(128), '  thirteen-plus-spaces  '])(
  'accepts the actual Unicode and UTF-8 policy without trimming',
  (value) => {
    expect(checkNewPassword(value)).toBeUndefined();
  },
);

it.each(['a'.repeat(129), '🔐'.repeat(129)])('rejects overlong new passwords', (value) => {
  expect(checkNewPassword(value)).toBe('passwordTooLong');
});

it('keeps spaces in new passwords and requires byte-for-byte confirmation', () => {
  const data = new FormData();
  data.set('newPassword', '  a long password  ');
  data.set('confirmPassword', 'a long password');
  expect(passwordConfirmation(data)).toMatchObject({
    valid: false,
    newPassword: '  a long password  ',
    errors: { confirmPassword: 'mismatch' },
  });
  data.set('confirmPassword', '  a long password  ');
  expect(passwordConfirmation(data)).toMatchObject({
    valid: true,
    newPassword: '  a long password  ',
  });
});

it('treats absent and non-string form fields as missing values', () => {
  const data = new FormData();
  data.set('newPassword', new File(['content'], 'password.txt'));
  expect(formString(data, 'newPassword')).toBe('');
  expect(formString(data, 'absent')).toBe('');
  expect(passwordConfirmation(data).errors).toEqual({ newPassword: 'passwordTooShort' });
});

it.each([
  '',
  '#token=',
  '#token=short',
  `#token=${'a'.repeat(44)}`,
  `#token=${'a'.repeat(42)}+`,
  `#token=${'a'.repeat(43)}&token=${'b'.repeat(43)}`,
  `#other=${'a'.repeat(43)}`,
])('rejects missing, malformed and ambiguous fragment tokens %s', (hash) => {
  expect(fragmentToken(hash)).toBeNull();
});

it('accepts only a single correctly shaped token from a fragment', () => {
  expect(fragmentToken(`#token=${'aB_-'.repeat(10)}123`)).toBe(`${'aB_-'.repeat(10)}123`);
});
