import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
interface RenderInput {
  title: string;
  description: string;
  brand: string;
  fontFile: string;
  width: number;
  height: number;
  maxImageBytes: number;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function input(value: unknown): RenderInput {
  if (
    !object(value) ||
    typeof value['title'] !== 'string' ||
    typeof value['description'] !== 'string' ||
    typeof value['brand'] !== 'string' ||
    typeof value['fontFile'] !== 'string' ||
    typeof value['width'] !== 'number' ||
    typeof value['height'] !== 'number' ||
    typeof value['maxImageBytes'] !== 'number'
  )
    throw new Error('Invalid renderer input');
  return {
    title: value['title'],
    description: value['description'],
    brand: value['brand'],
    fontFile: value['fontFile'],
    width: value['width'],
    height: value['height'],
    maxImageBytes: value['maxImageBytes'],
  };
}
const configuration = input(workerData);
if (!parentPort) throw new Error('Renderer runtime unavailable');
globalThis.fetch = Object.assign(
  () => Promise.reject(new Error('Network unavailable during private image rendering')),
  {
    preconnect: () => {
      throw new Error('Network unavailable during private image rendering');
    },
  },
);
const element = h(
  'div',
  {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '64px',
      background: '#ffffff',
      color: '#171717',
      fontFamily: 'AdminOG',
    },
  },
  h('div', { style: { display: 'flex', fontSize: 28, color: '#737373' } }, configuration.brand),
  h(
    'div',
    { style: { display: 'flex', fontSize: 56, lineHeight: 1.2, wordBreak: 'break-word' } },
    configuration.title,
  ),
  h(
    'div',
    { style: { display: 'flex', fontSize: 24, color: '#525252', lineHeight: 1.4 } },
    configuration.description,
  ),
);
const bytes = await readFile(configuration.fontFile);
const image = new ImageResponse(element, {
  width: configuration.width,
  height: configuration.height,
  fonts: [{ name: 'AdminOG', data: Uint8Array.from(bytes).buffer, weight: 400, style: 'normal' }],
});
const buffer = await image.arrayBuffer();
if (buffer.byteLength > configuration.maxImageBytes)
  throw new Error('Image exceeds response budget');
parentPort.postMessage(buffer, [buffer]);
