import { parseSync, Visitor } from 'oxc-parser';
import type { VisitorObject } from 'oxc-parser';
import type { Context, Diagnostic, Rule } from '@oxlint/plugins';

export function lintRule(rule: Rule, input: { code: string; filename: string }): Diagnostic[] {
  const parsed = parseSync(input.filename, input.code);
  if (parsed.errors.length > 0) throw new Error(JSON.stringify(parsed.errors));
  const diagnostics: Diagnostic[] = [];
  const context = {
    filename: input.filename,
    sourceCode: { getAllComments: () => parsed.comments },
    report: (diagnostic: Diagnostic) => diagnostics.push(diagnostic),
  } as unknown as Context;
  if (!rule.create) throw new Error('Test harness requires a create rule.');
  const visitor = new Visitor(rule.create(context) as unknown as VisitorObject);
  visitor.visit(parsed.program);
  return diagnostics;
}
