import { expect, it } from 'vitest';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { audio, execute, mp3, program, protocol } from './multimodal-fixture.ts';
const languages = ['javascript', 'typescript', 'python', 'curl', 'go'];
it.each(languages)(
  '%s ASR program uploads multipart once and emits only settled text',
  async (language) => {
    const fixture = await protocol('asr');
    const sample = await program({ language, kind: 'asr', baseUrl: fixture.baseUrl });
    try {
      const result = await execute({ ...sample, language });
      expect(result.stderr).toContain('stable-multimodal-intent');
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('Recognized real protocol text');
      expect(fixture.errors).toEqual([]);
      expect(fixture.received.map((item) => item.path)).toEqual([
        'POST /v1/audio/transcriptions',
        'GET /v1/tasks/10000000-0000-4000-8000-000000000009',
      ]);
      expect(fixture.received[0]).toMatchObject({
        intent: 'stable-multimodal-intent',
        authorization: 'Bearer oak_isolated',
        fields: { model: 'business/asr', language: 'en', names: ['file', 'language', 'model'] },
        file: audio,
      });
    } finally {
      fixture.server.closeAllConnections();
      await new Promise<void>((resolve) => {
        fixture.server.close(() => resolve());
      });
      await rm(sample.directory, { recursive: true, force: true });
    }
  },
);
it.each(languages)(
  '%s music program archives the settled MP3 without a second paid POST',
  async (language) => {
    const fixture = await protocol('music');
    const sample = await program({ language, kind: 'music', baseUrl: fixture.baseUrl });
    try {
      const result = await execute({ ...sample, language });
      expect(result.code).toBe(0);
      expect(fixture.errors).toEqual([]);
      expect(fixture.received.map((item) => item.path)).toEqual([
        'POST /v1/tasks',
        'GET /v1/tasks/10000000-0000-4000-8000-000000000009',
        'GET /v1/tasks/10000000-0000-4000-8000-000000000009/content',
      ]);
      expect(fixture.received[0]?.fields).toEqual({
        kind: 'music',
        model: 'business/music',
        input: { prompt: 'An "original" melody $()', is_instrumental: true },
      });
      expect(await readFile(join(sample.directory, 'result.mp3'))).toEqual(mp3);
    } finally {
      fixture.server.closeAllConnections();
      await new Promise<void>((resolve) => {
        fixture.server.close(() => resolve());
      });
      await rm(sample.directory, { recursive: true, force: true });
    }
  },
);
it.each(languages)(
  '%s audio program retains unknown intent and refuses missing or oversized local files',
  async (language) => {
    const fixture = await protocol('asr', 'unknown');
    const sample = await program({ language, kind: 'asr', baseUrl: fixture.baseUrl });
    try {
      const uncertain = await execute({ ...sample, language });
      expect(uncertain.code).not.toBe(0);
      expect(uncertain.stderr.toLowerCase()).toContain('unknown');
      expect(fixture.received).toHaveLength(2);
      const missing = await execute({ ...sample, language, file: '' });
      expect(missing.code, missing.stderr).not.toBe(0);
      expect(fixture.received).toHaveLength(2);
      await writeFile(join(sample.directory, 'input.wav'), Buffer.alloc(8388609));
      const oversized = await execute({ ...sample, language });
      expect(oversized.code).not.toBe(0);
      expect(fixture.received).toHaveLength(2);
    } finally {
      fixture.server.closeAllConnections();
      await new Promise<void>((resolve) => {
        fixture.server.close(() => resolve());
      });
      await rm(sample.directory, { recursive: true, force: true });
    }
  },
);
