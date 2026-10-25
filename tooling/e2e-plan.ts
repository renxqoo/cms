export interface E2ETarget {
  kind: 'api' | 'browser';
  args: string[];
}

export function e2ePlan(args: string[]): E2ETarget[] {
  if (args.length === 0)
    return [
      { kind: 'api', args: [] },
      { kind: 'browser', args: [] },
    ];
  const specs = args.filter((value) => value.endsWith('.spec.ts'));
  const browser = specs.some((value) => value.endsWith('.browser.spec.ts'));
  if (browser && specs.some((value) => !value.endsWith('.browser.spec.ts')))
    throw new Error('Run API and browser specifications in separate commands.');
  return [{ kind: browser ? 'browser' : 'api', args }];
}
