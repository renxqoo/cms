import { stdin, stderr } from 'node:process';

export class PasswordInputError extends Error {
  readonly code: 'cancelled' | 'too_long' | 'invalid_input';

  constructor(code: PasswordInputError['code']) {
    super(`Password input ${code}`);
    this.name = 'PasswordInputError';
    this.code = code;
  }
}

function readTerminal(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const previousRaw = stdin.isRaw;
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    let input = '';
    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(previousRaw);
      stdin.pause();
      stderr.write('\n');
    }
    function onData(chunk: Buffer) {
      let text: string;
      try {
        text = decoder.decode(chunk, { stream: true });
      } catch {
        cleanup();
        reject(new PasswordInputError('invalid_input'));
        return;
      }
      for (const character of text) {
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(input);
          return;
        }
        if (character === '\u0003' || character === '\u0004') {
          cleanup();
          reject(new PasswordInputError('cancelled'));
          return;
        }
        if (character === '\u007f') input = Array.from(input).slice(0, -1).join('');
        else input += character;
        if (Buffer.byteLength(input) > 2048) {
          cleanup();
          reject(new PasswordInputError('too_long'));
          return;
        }
      }
    }
    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

export async function readPassword(prompt: string): Promise<string> {
  if (stdin.isTTY) return readTerminal(prompt);
  let value = '';
  stdin.setEncoding('utf8');
  for await (const chunk of stdin) {
    if (typeof chunk !== 'string') throw new PasswordInputError('invalid_input');
    value += chunk;
    if (Buffer.byteLength(value) > 2048) throw new PasswordInputError('too_long');
  }
  return value.replace(/\r?\n$/, '');
}
