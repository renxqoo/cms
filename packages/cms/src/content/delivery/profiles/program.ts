import { validApiBaseUrl } from './base-url.ts';
import { z } from 'zod';
import type { ProfileRequest } from './requests.ts';
import { validateProfileRequest } from './requests.ts';
export interface ExamplePolicy {
  requestTimeoutMs: number;
  pollIntervalMs: number;
  pollDeadlineMs: number;
  maxResponseBytes: number;
}
export interface ExampleInput extends ProfileRequest {
  baseUrl: string;
  policy: ExamplePolicy;
}
export interface IntegrationExample {
  key: string;
  language: string;
  code: string;
  requirements: string[];
}
const policySchema = z.strictObject({
  requestTimeoutMs: z.number().int().min(1000).max(600000),
  pollIntervalMs: z.number().int().min(1000).max(60000),
  pollDeadlineMs: z.number().int().min(1000).max(3600000),
  maxResponseBytes: z.number().int().min(1024).max(33554432),
});
export function exampleContext(input: ExampleInput) {
  const policy = policySchema.parse(input.policy);
  if (!validApiBaseUrl(input.baseUrl)) throw new Error('Use a versioned OneAster API base URL');
  const url = new URL(input.baseUrl);
  const body = validateProfileRequest(input);
  let mode = 'task';
  if (input.profileKey === 'core.chat') mode = 'json';
  if (input.flowKey === 'chat.sse') mode = 'sse';
  if (input.profileKey === 'core.transcriptions') mode = 'transcription';
  return {
    ...policy,
    baseUrl: url.href.replace(/\/$/u, ''),
    body,
    mode,
    image: input.profileKey === 'core.image-tasks',
  };
}
export type ExampleContext = ReturnType<typeof exampleContext>;
export function encodedBody(context: ExampleContext): string {
  return Buffer.from(JSON.stringify(context.body)).toString('base64');
}
export function renderProgram(template: string, context: ExampleContext): string {
  const values: Record<string, string> = {
    BODY: encodedBody(context),
    BASE: Buffer.from(context.baseUrl).toString('base64'),
    MODE: context.mode,
    REQUEST_MS: String(context.requestTimeoutMs),
    POLL_MS: String(context.pollIntervalMs),
    DEADLINE_MS: String(context.pollDeadlineMs),
    MAX_BYTES: String(context.maxResponseBytes),
    REQUEST_SECONDS: String(Math.ceil(context.requestTimeoutMs / 1000)),
    DEADLINE_SECONDS: String(Math.ceil(context.pollDeadlineMs / 1000)),
    POLL_SECONDS: String(context.pollIntervalMs / 1000),
  };
  return template
    .replace(/@@([A-Z_]+)@@/gu, (_match, key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error('Unknown template token');
      return value;
    })
    .trim();
}
