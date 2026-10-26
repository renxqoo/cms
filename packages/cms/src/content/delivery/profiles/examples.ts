import { curlExample } from './curl.ts';
import { goExample } from './go.ts';
import { javaExample } from './java.ts';
import { javascriptExample, typescriptExample } from './javascript.ts';
import { phpExample } from './php.ts';
import { pythonExample } from './python.ts';
import { exampleContext } from './program.ts';
import type { ExampleInput, IntegrationExample } from './program.ts';

const renderers = [
  {
    key: 'curl',
    language: 'bash',
    render: curlExample,
    requirements: ['Bash', 'cURL >= 8.4', 'jq >= 1.6', 'uuidgen'],
  },
  { key: 'python', language: 'python', render: pythonExample, requirements: ['Python >= 3.9'] },
  {
    key: 'javascript',
    language: 'javascript',
    render: javascriptExample,
    requirements: ['Node.js >= 20'],
  },
  {
    key: 'typescript',
    language: 'typescript',
    render: typescriptExample,
    requirements: ['Node.js >= 20', 'TypeScript with Node.js types'],
  },
  { key: 'go', language: 'go', render: goExample, requirements: ['Go >= 1.21'] },
  {
    key: 'java',
    language: 'java',
    render: javaExample,
    requirements: ['Java >= 17', 'Jackson Databind 2.x on the classpath'],
  },
  { key: 'php', language: 'php', render: phpExample, requirements: ['PHP >= 8.0', 'ext-curl'] },
];
export function renderIntegrationExamples(input: ExampleInput): IntegrationExample[] {
  const context = exampleContext(input);
  return renderers.map(({ key, language, render, requirements }) => ({
    key,
    language,
    code: render(context),
    requirements:
      context.mode === 'transcription'
        ? [
            ...requirements,
            'Set ONEASTER_AUDIO_FILE to a local PCM WAV file, at most 8 MiB / 120 seconds',
          ]
        : [...requirements],
  }));
}
