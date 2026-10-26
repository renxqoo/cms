import { safeAdminDestination } from '../../config/admin-routes';

export function safeLoginNext(value: unknown): string {
  return safeAdminDestination(value);
}

export function replaceAfterLogin(value: unknown): void {
  window.location.replace(safeLoginNext(value));
}

export function checkLoginSession(): void {
  window.location.reload();
}
