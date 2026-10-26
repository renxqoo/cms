export const credentialPolicy = {
  nameMaxLength: 80,
  defaultLifetimeDays: 30,
  maxLifetimeDays: 90,
  millisecondsPerDay: 86_400_000,
  pageSize: 20,
} as const;

export function defaultKeyExpiry(now = Date.now()): string {
  const date = new Date(
    now + credentialPolicy.defaultLifetimeDays * credentialPolicy.millisecondsPerDay,
  );
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function validKeyExpiry(value: string, now = Date.now()): boolean {
  const date = new Date(value).getTime();
  return (
    Number.isFinite(date) &&
    date > now &&
    date <= now + credentialPolicy.maxLifetimeDays * credentialPolicy.millisecondsPerDay
  );
}
