export interface E2ETarget {
  kind: 'api' | 'browser';
  args: string[];
}

const valueFlags = new Set([
  '--project',
  '--grep',
  '-g',
  '--grep-invert',
  '--config',
  '-c',
  '--output',
  '--reporter',
  '--workers',
  '-j',
  '--timeout',
  '--global-timeout',
  '--max-failures',
  '--retries',
  '--repeat-each',
  '--shard',
  '--trace',
  '--browser',
  '--channel',
  '--testNamePattern',
  '-t',
]);

export function specificationArguments(args: readonly string[]) {
  const files: string[] = [];
  const filters: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value && valueFlags.has(value)) {
      filters.push(value);
      const argument = args[++index];
      if (argument !== undefined) filters.push(argument);
    } else if (value && !value.startsWith('-') && value.endsWith('.spec.ts')) files.push(value);
    else if (value !== undefined) filters.push(value);
  }
  return { files, filters };
}

export function e2ePlan(args: string[]): E2ETarget[] {
  if (args.length === 0)
    return [
      { kind: 'api', args: [] },
      { kind: 'browser', args: [] },
    ];
  const { files: specs } = specificationArguments(args);
  const browser = specs.some((value) => value.endsWith('.browser.spec.ts'));
  if (browser && specs.some((value) => !value.endsWith('.browser.spec.ts')))
    throw new Error('Run API and browser specifications in separate commands.');
  return [{ kind: browser ? 'browser' : 'api', args }];
}
