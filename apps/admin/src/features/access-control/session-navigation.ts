export function replaceExpiredSession() {
  window.location.replace('/login?reason=expired');
}

export function reloadRestoredSession() {
  window.location.reload();
}
