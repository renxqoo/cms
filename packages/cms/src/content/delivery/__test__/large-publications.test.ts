import { expect, it } from 'vitest';
import {
  createPublicFixture,
  createPublicModel,
} from '../../../../../../test/support/public-runtime.ts';

it('a summary-only catalogue must not fail because valid full documents exceed its raw row budget', async () => {
  const kit = await createPublicFixture();
  try {
    for (let i = 0; i < 3; i += 1)
      await createPublicModel(kit, {
        modelId: `large-${i}`,
        slug: `large-${i}`,
        content: { overview: 'x'.repeat(800000) },
      });
    const result = await kit.delivery.listModels({ locale: 'en' });
    expect(result.data.models).toHaveLength(3);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(10000);
  } finally {
    await kit.close();
  }
});

it('a complete summary export must not fail because valid full documents exceed one raw batch budget', async () => {
  const kit = await createPublicFixture();
  try {
    for (let i = 0; i < 3; i += 1)
      await createPublicModel(kit, {
        modelId: `large-${i}`,
        slug: `large-${i}`,
        content: { overview: 'x'.repeat(800000) },
      });
    const frames: string[] = [];
    await kit.delivery.exportContent({ kind: 'model-guides', locale: 'en' }, (frame) => {
      frames.push(Buffer.from(frame).toString());
      return Promise.resolve();
    });
    expect(frames.join('')).toContain('"type":"end"');
    expect(frames.filter((frame) => frame.includes('"type":"item"'))).toHaveLength(3);
  } finally {
    await kit.close();
  }
});
