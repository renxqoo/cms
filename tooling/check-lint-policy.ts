import { checkLintDirectives } from './lint-policy.ts';

const violations = checkLintDirectives(process.cwd());
if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
}
