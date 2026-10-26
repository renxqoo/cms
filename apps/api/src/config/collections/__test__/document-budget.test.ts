import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { projectDocumentBody } from '@new-cms/cms/content/delivery';
import { validDocumentBody } from '../publication-document.ts';

it('measures the projected public body so derived metadata cannot publish an unreadable boundary document', () => {
  const blocks = Array.from({ length: 11 }, () => ({
    id: randomUUID(),
    blockType: 'code',
    language: 'text',
    code: '',
  }));
  const body = {
    introduction: { title: 'Guide', body: { version: 1, children: [] } },
    sections: [{ id: randomUUID(), anchor: 'guide', title: 'Guide', blocks }],
  };
  const overhead = Buffer.byteLength(JSON.stringify(projectDocumentBody(body)));
  let remaining = 1_048_576 - overhead;
  for (const block of blocks) {
    const length = Math.min(100000, remaining);
    block.code = 'x'.repeat(length);
    remaining -= length;
  }
  expect(remaining).toBe(0);
  expect(Buffer.byteLength(JSON.stringify(projectDocumentBody(body)))).toBe(1_048_576);
  expect(validDocumentBody({ body })).toBe(true);
  const [first] = blocks;
  if (!first) throw new Error('Missing first block');
  first.code += 'x';
  expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(1_048_576);
  expect(validDocumentBody({ body })).toBe(false);
});
