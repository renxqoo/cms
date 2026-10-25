import { deflateSync } from 'node:zlib';

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, bytes: Uint8Array): Buffer {
  const payload = Buffer.concat([Buffer.from(type), bytes]);
  const result = Buffer.alloc(payload.length + 8);
  result.writeUInt32BE(bytes.length, 0);
  payload.copy(result, 4);
  result.writeUInt32BE(crc32(payload), payload.length + 4);
  return result;
}
export function png(color: readonly [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = new Uint8Array([0, ...color, ...color]);
  return Buffer.concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', new Uint8Array()),
  ]);
}
