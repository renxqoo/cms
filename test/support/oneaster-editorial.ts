import { readFileSync } from 'node:fs';
import { z } from 'zod';
export function editorialFixture(kind: 'home' | 'site') {
  return z
    .record(z.string(), z.json())
    .parse(
      JSON.parse(
        readFileSync(new URL(`../fixtures/oneaster-${kind}.json`, import.meta.url), 'utf8'),
      ),
    );
}
export const paragraph = {
  version: 1,
  children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Published instructions.' }] }],
};
export function nativeDocument() {
  return {
    slug: 'native-guide',
    title: 'Native guide',
    summary: 'A published guide',
    contentLocales: ['en'],
    body: {
      introduction: {
        title: 'Getting started',
        body: paragraph,
        callout: { tone: 'info', title: 'Before starting', body: paragraph },
      },
      sections: [
        {
          anchor: 'quickstart',
          title: 'Quickstart',
          blocks: documentBlocks(),
        },
      ],
      next: {
        title: 'Start building',
        link: { kind: 'action', label: 'Console', action: 'console' },
      },
    },
  };
}

function documentBlocks() {
  return [
    { blockType: 'rich_text', body: paragraph },
    { blockType: 'callout', tone: 'warning', title: 'Keep keys private', body: paragraph },
    { blockType: 'steps', items: [{ title: 'Create a key', body: paragraph }] },
    { blockType: 'code', language: 'java', code: ' '.repeat(60000) },
    {
      blockType: 'code_tabs',
      label: 'SDKs',
      items: [
        { key: 'go', label: 'Go', language: 'go', code: 'package main' },
        { key: 'php', label: 'PHP', language: 'php', code: '<?php' },
      ],
    },
    {
      blockType: 'endpoint',
      method: 'POST',
      path: '/v1/chat/completions',
      headers: [{ name: 'Authorization', value: 'Bearer $ONEASTER_API_KEY' }],
    },
    {
      blockType: 'field_table',
      caption: 'Request fields',
      fieldLabel: 'Field',
      typeLabel: 'Type',
      descriptionLabel: 'Description',
      rows: [{ name: 'model', valueType: 'string', description: paragraph }],
    },
    { blockType: 'accordion', items: [{ question: 'How do I start?', answer: paragraph }] },
    {
      blockType: 'cta',
      title: 'Choose a model',
      link: { kind: 'internal', label: 'Models', path: '/models' },
    },
  ];
}
