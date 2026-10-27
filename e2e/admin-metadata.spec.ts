import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { createMetadataTransport } from '../test/support/admin-metadata-fixture.ts';
import { metadataDocument } from '../test/support/admin-metadata-data.ts';
import { availablePort } from '../test/support/tcp-port.ts';
import { startNext } from '../test/support/admin-application-process.ts';
async function build() {
  const child = spawn(process.execPath, ['run', '--cwd', 'apps/admin', 'build'], {
    env: { ...process.env, CMS_ADMIN_E2E: 'suite' },
    signal: AbortSignal.timeout(120000),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (value: Buffer) => {
    output = (output + value.toString()).slice(-65536);
  });
  child.stderr.on('data', (value: Buffer) => {
    output = (output + value.toString()).slice(-65536);
  });
  const code = await new Promise<number | null>((done, reject) => {
    child.once('exit', done);
    child.once('error', reject);
  });
  if (code !== 0) throw new Error(`Next metadata build failed: ${output}`);
}
beforeEach(() => {
  vi.stubEnv('CMS_ADMIN_E2E', 'suite');
});
afterEach(() => vi.unstubAllEnvs());

const headers = (actor = 'metadata-first') => ({
  Cookie: `oneaster-session=${actor}`,
  'User-Agent': 'Twitterbot/1.0',
});
it.each(['production', 'development'] as const)(
  '%s Next serves private PNGs and isolated localized Head data through a transport substitute',
  async (mode) => {
    if (mode === 'production') await build();
    const transport = await createMetadataTransport();
    let next: Awaited<ReturnType<typeof startNext>> | undefined;
    try {
      const port = await availablePort();
      next = await startNext({ mode, port, apiOrigin: transport.origin });
      const origin = `http://127.0.0.1:${port}`;
      const path = `/dashboard/collections/articles/${metadataDocument.id}?locale=zh`;
      const first = await fetch(origin + path, { headers: headers() });
      expect(first.status).toBe(200);
      const firstHtml = await first.text();
      expect(firstHtml).toContain('<title>First actor document — 管理</title>');
      expect(firstHtml).toContain('name="description" content="只使用当前用户有权读取的内容"');
      expect(firstHtml).toContain('property="og:image"');
      expect(firstHtml).toContain('name="theme-color" content="#ffffff"');
      const second = await fetch(origin + path, { headers: headers('metadata-second') });
      expect(second.status).toBe(200);
      const secondHtml = await second.text();
      expect(secondHtml).toContain('<title>Second actor document — 管理</title>');
      expect(secondHtml).not.toContain('<title>First actor document — 管理</title>');
      expect(
        transport.requests.some(
          (request) => request.path === '/v1/collections/articles' && request.locale === 'zh',
        ),
      ).toBe(true);
      const imagePath = `/api/admin/collections/articles/og?id=${metadataDocument.id}&locale=zh`;
      const image = await fetch(origin + imagePath, { headers: headers() });
      expect(image.status, next.output()).toBe(200);
      expect(image.headers.get('content-type')).toContain('image/png');
      expect(image.headers.get('cache-control')).toBe('private, no-store');
      expect(image.headers.get('vary')).toContain('Cookie');
      const bytes = new Uint8Array(await image.arrayBuffer());
      expect(bytes.slice(0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(new DataView(bytes.buffer).getUint32(16)).toBe(1200);
      expect(new DataView(bytes.buffer).getUint32(20)).toBe(630);
      const denied = await fetch(origin + imagePath, { headers: headers('metadata-denied') });
      expect(denied.status).toBe(404);
      expect(await denied.text()).toBe('');
      const anonymous = await fetch(origin + imagePath, { redirect: 'manual' });
      expect(anonymous.status).toBe(404);
      expect(await anonymous.text()).toBe('');
      transport.setMode('off');
      const disabled = await fetch(origin + imagePath, { headers: headers() });
      expect(disabled.status).toBe(404);
      expect(await disabled.text()).toBe('');
      transport.setMode('dynamic');
      const cancellation = new AbortController();
      const pending = fetch(origin + imagePath, {
        headers: headers(),
        signal: cancellation.signal,
      }).then(
        () => false,
        () => true,
      );
      await new Promise((done) => {
        setTimeout(done, 20);
      });
      cancellation.abort();
      expect(await pending).toBe(true);
      await expect
        .poll(
          async () => {
            const followups = await Promise.all([
              fetch(origin + imagePath, { headers: headers() }),
              fetch(origin + imagePath, { headers: headers('metadata-second') }),
            ]);
            for (const response of followups) await response.arrayBuffer();
            return followups.map((response) => response.status);
          },
          { timeout: 5000, interval: 50 },
        )
        .toEqual([200, 200]);
    } finally {
      await next?.close();
      await transport.close();
    }
  },
  180000,
);
