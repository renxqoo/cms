import { safeAdminDestination } from '../../config/admin-routes';
import { authorizationReturnPath } from '../credentials/authorization-navigation';

export function safeLoginNext(value: unknown): string {
  return authorizationReturnPath(value) ?? safeAdminDestination(value);
}

export function replaceAfterLogin(value: unknown): void {
  window.location.replace(safeLoginNext(value));
}

export function checkLoginSession(): void {
  window.location.reload();
}
