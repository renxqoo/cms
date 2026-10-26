import { expect, it } from 'vitest';
import { validApiBaseUrl } from '../base-url.ts';
import { exampleContext } from '../program.ts';
import { renderIntegrationExamples } from '../examples.ts';
import { curlExample } from '../curl.ts';
import { pythonExample } from '../python.ts';
import { javascriptExample, typescriptExample } from '../javascript.ts';
import { goExample } from '../go.ts';
import { javaExample } from '../java.ts';
import { phpExample } from '../php.ts';
const sample = {
  profileKey: 'core.chat',
  flowKey: 'chat.json',
  modelId: 'business/model',
  requestValues: { messages: [{ role: 'user', content: 'Hello' }], max_tokens: 16 },
  baseUrl: 'https://api.example.com/v1',
  policy: {
    requestTimeoutMs: 1000,
    pollIntervalMs: 1000,
    pollDeadlineMs: 1000,
    maxResponseBytes: 1024,
  },
};

it.each([
  "https://x'$(id)'.com/v1",
  'https://bad_host.com/v1',
  'https://a..b/v1',
  'https://-api.example/v1',
  'https://api-.example/v1',
  'https://api.example.com:65536/v1',
  'https://api.example.com/v1?bad=1',
  'https://user:pass@api.example.com/v1',
  'https://%27.com/v1',
  `https://${'a'.repeat(64)}.com/v1`,
])(
  'refuses unsafe or malformed API origins before generating executable snippets: %s',
  (baseUrl) => {
    expect(validApiBaseUrl(baseUrl)).toBe(false);
    expect(() => renderIntegrationExamples({ ...sample, baseUrl })).toThrow(
      'Use a versioned OneAster API base URL',
    );
  },
);
it.each([
  'https://api.example.com/v1',
  'https://例子.测试/v1',
  'https://192.0.2.1:443/v1',
  'https://[2001:db8::1]:8443/v1',
  'http://127.0.0.1:3301/v1',
  'http://[::1]:3301/v1',
])('accepts canonical HTTP transport hosts without changing the versioned path: %s', (baseUrl) =>
  expect(validApiBaseUrl(baseUrl)).toBe(true),
);
it('encodes the base independently of language literals even if a future caller bypasses host validation', () => {
  const baseUrl = "https://x'$(id)'.com/v1";
  const context = { ...exampleContext(sample), baseUrl };
  for (const render of [
    curlExample,
    pythonExample,
    javascriptExample,
    typescriptExample,
    goExample,
    javaExample,
    phpExample,
  ]) {
    const code = render(context);
    expect(code).not.toContain(baseUrl);
    expect(code).toContain(Buffer.from(baseUrl).toString('base64'));
    expect(code).not.toContain('@@BASE@@');
  }
});
