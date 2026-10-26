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
            paragraph: 'mb-3 last:mb-0',
            heading: { h2: 'mb-3 text-xl font-semibold' },
            link: 'text-primary underline underline-offset-4',
            list: { ul: 'ml-6 list-disc', listitem: 'mb-1' },
          },
        }}
      >
        <div className="min-w-0 overflow-hidden rounded-xl border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <RichTextToolbar readOnly={props.readOnly} />
          <div className="relative">
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  aria-label={props.label}
                  aria-multiline="true"
                  aria-placeholder={field.t.richTextPlaceholder}
                  placeholder={
                    props.readOnly ? (
                      () => null
                    ) : (
                      <p className="pointer-events-none absolute top-4 left-4 text-sm leading-7 text-muted-foreground sm:left-5">
                        {field.t.richTextPlaceholder}
                      </p>
                    )
                  }
                  className="min-h-56 max-h-[32rem] overflow-auto px-4 py-4 text-sm leading-7 break-words outline-none sm:px-5"
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin validateUrl={safeRichTextLink} />
          <RichTextBridge {...props} value={parsed} />
        </div>
      </LexicalComposer>
    </RichLocation>
  );
}
