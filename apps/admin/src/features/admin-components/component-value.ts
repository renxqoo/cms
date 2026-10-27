export function componentValue<T>(
  map: Readonly<Record<string, T>> | undefined,
  id: string,
): T | undefined {
  return map && Object.hasOwn(map, id) ? map[id] : undefined;
}
