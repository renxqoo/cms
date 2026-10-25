import { dirname, resolve, sep } from 'node:path';
import { definePlugin, defineRule } from '@oxlint/plugins';
import type { Context, ESTree, Node } from '@oxlint/plugins';
import { findProjectRoot, importViolation, readWorkspaces } from './workspaces.ts';
import { canonicalPath, resolveImport } from './resolution.ts';

export const noCodeComments = defineRule({
  meta: {
    type: 'problem',
    messages: {
      forbidden:
        'Code comments are prohibited by AGENTS.md; put design explanations in documentation.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          context.report({ node: comment, messageId: 'forbidden' });
        }
      },
    };
  },
});

function privateTestViolation(filename: string, specifier: string): boolean {
  const target = canonicalPath(
    resolveImport(filename, specifier) ?? resolve(dirname(filename), specifier),
  );
  const normalized = target.replaceAll('\\', '/');
  if (!normalized.split('/').includes('__test__')) return false;
  const source = canonicalPath(filename).split(sep);
  const index = source.indexOf('__test__');
  if (index === -1) return true;
  const testDirectory = source.slice(0, index + 1).join(sep);
  return target !== testDirectory && !target.startsWith(`${testDirectory}${sep}`);
}

export const privateTests = defineRule({
  meta: {
    type: 'problem',
    messages: {
      forbidden: 'Do not import another module private __test__ files; use test/support.',
    },
    schema: [],
  },
  create(context) {
    function check(specifier: string, node: Node) {
      if (privateTestViolation(context.filename, specifier))
        context.report({ node, messageId: 'forbidden' });
    }
    return importVisitors(context, check);
  },
});

function importVisitors(context: Context, check: (specifier: string, node: Node) => void) {
  function checkLiteral(source: ESTree.Expression, node: Node) {
    if (source.type === 'Literal' && typeof source.value === 'string') {
      check(source.value, node);
    } else {
      context.report({
        node,
        message: 'Use a literal dynamic import so dependency boundaries can be checked.',
      });
    }
  }
  return {
    ImportDeclaration(node: ESTree.ImportDeclaration) {
      check(node.source.value, node);
    },
    ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
      if (node.source) check(node.source.value, node);
    },
    ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
      check(node.source.value, node);
    },
    ImportExpression(node: ESTree.ImportExpression) {
      checkLiteral(node.source, node);
    },
    TSImportType(node: ESTree.TSImportType) {
      check(node.source.value, node);
    },
  };
}

export const workspaceBoundaries = defineRule({
  meta: { type: 'problem', schema: [] },
  create(context) {
    const root = findProjectRoot(context.filename);
    const workspaces = root ? readWorkspaces(root) : [];
    function check(specifier: string, node: Node) {
      const message = importViolation({ filename: context.filename, specifier, workspaces });
      if (message) context.report({ node, message });
    }
    return importVisitors(context, check);
  },
});

export default definePlugin({
  meta: { name: 'cms' },
  rules: {
    'no-code-comments': noCodeComments,
    'workspace-boundaries': workspaceBoundaries,
    'private-tests': privateTests,
  },
});
