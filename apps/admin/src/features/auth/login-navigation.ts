const loginDestinations = new Set(['/dashboard']);

export function safeLoginNext(value: unknown): string {
  return typeof value === 'string' && loginDestinations.has(value) ? value : '/dashboard';
}

export function replaceAfterLogin(value: unknown): void {
  window.location.replace(safeLoginNext(value));
}

export function checkLoginSession(): void {
  window.location.reload();
}
