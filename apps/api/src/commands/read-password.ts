import { stdin, stderr } from 'node:process';

function readTerminal(): Promise<string> {
  return new Promise((resolve, reject) => {
    const previousRaw = stdin.isRaw;
    let input = '';
    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(previousRaw);
      stdin.pause();
      stderr.write('\n');
    }
    function onData(chunk: Buffer) {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(input);
          return;
        }
        if (character === '\u0003' || character === '\u0004') {
          cleanup();
          reject(new Error('Password input cancelled'));
          return;
        }
        if (character === '\u007f') input = Array.from(input).slice(0, -1).join('');
        else input += character;
        if (Buffer.byteLength(input) > 2048) {
          cleanup();
          reject(new Error('Password input too long'));
          return;
        }
      }
    }
    stderr.write('New administrator password: ');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

export async function readPassword(): Promise<string> {
  if (stdin.isTTY) return readTerminal();
  let value = '';
  stdin.setEncoding('utf8');
  for await (const chunk of stdin) {
    if (typeof chunk !== 'string') throw new Error('Invalid password input');
    value += chunk;
    if (Buffer.byteLength(value) > 2048) throw new Error('Password input too long');
  }
  return value.replace(/\r?\n$/, '');
}
