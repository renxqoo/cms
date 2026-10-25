'use client';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { useFields } from './field-context';
import { prepareRichText, richTextLexicalNodes } from './rich-text-mapping';
import { parseRichText, safeRichTextLink } from './rich-text-value';
import { RichTextBridge } from './rich-text-bridge';
import { RichTextToolbar } from './rich-text-toolbar';
import { RichLocation } from './rich-text-reference';
import { RichTextStructure } from './rich-text-structure';
import type { RichBridgeProps } from './rich-text-bridge';
import type { FieldLocation, JsonValue } from './types';

interface VisualProps extends Omit<RichBridgeProps, 'value'> {
  value: JsonValue;
  label: string;
  location: FieldLocation;
}

export default function RichTextVisual(props: VisualProps) {
  const field = useFields();
  const parsed = parseRichText(props.value, field.richTextNodes);
  const prepared = parsed ? prepareRichText(parsed) : null;
  if (!parsed || !prepared)
    return (
      <div className="space-y-3">
        <p role="status" className="text-sm text-muted-foreground">
          {field.t.structuralNotice}
        </p>
        <RichTextStructure {...props} />
      </div>
    );
  return (
    <RichLocation value={props.location}>
      <LexicalComposer
        initialConfig={{
          namespace: props.identity,
          nodes: richTextLexicalNodes,
          editorState: prepared,
          editable: !props.readOnly,
          onError: () => {
            field.onValidityChange(props.identity, field.t.invalidRich);
            props.onInvalidChange(true);
          },
          theme: {
            paragraph: 'mb-2',
            heading: { h2: 'mb-3 text-xl font-semibold' },
            link: 'text-primary underline underline-offset-4',
            list: { ul: 'ml-6 list-disc', listitem: 'mb-1' },
          },
        }}
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card focus-within:ring-2 focus-within:ring-ring/50">
          <RichTextToolbar readOnly={props.readOnly} />
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label={props.label}
                className="min-h-40 max-h-[30rem] overflow-auto p-4 outline-none"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin validateUrl={safeRichTextLink} />
          <RichTextBridge {...props} value={parsed} />
        </div>
      </LexicalComposer>
    </RichLocation>
  );
}
