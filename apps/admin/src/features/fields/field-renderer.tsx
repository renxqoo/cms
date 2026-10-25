'use client';

import { FieldsProvider } from './field-context';
import { FieldNode } from './field-node';
import type { FieldRendererProps, FieldLocation } from './types';

function FieldTree({
  layout,
  location,
  readOnly,
}: {
  layout: FieldRendererProps['layout'];
  location: FieldLocation;
  readOnly: boolean;
}) {
  return (
    <div className="min-w-0 space-y-4">
      {layout.map((node) => (
        <FieldNode
          key={node.id}
          node={node}
          parent={location}
          inheritedReadOnly={readOnly}
          renderChildren={(children, childLocation, childReadOnly) => (
            <FieldTree layout={children} location={childLocation} readOnly={childReadOnly} />
          )}
        />
      ))}
    </div>
  );
}

export function FieldRenderer(props: FieldRendererProps) {
  return (
    <FieldsProvider value={props}>
      <FieldTree
        key={props.resetKey}
        layout={props.layout}
        location={{ path: [], identity: props.idPrefix, sourcePath: '' }}
        readOnly={props.readOnly === true}
      />
    </FieldsProvider>
  );
}

export type {
  FieldRendererProps,
  FieldServices,
  FieldData,
  FieldPath,
  ReferencePage,
  ReferenceQuery,
  ReferenceValue,
  JsonValue,
} from './types';
