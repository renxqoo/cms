'use client';

import { FieldsProvider, useFields } from './field-context';
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
  const { t } = useFields();
  const main = layout.filter((node) => node.position !== 'sidebar');
  const sidebar = layout.filter((node) => node.position === 'sidebar');
  const region = (nodes: FieldRendererProps['layout']) => (
    <div className="-mx-2 flex min-w-0 flex-wrap gap-y-4">
      {nodes.map((node) => (
        <FieldNode
          key={node.id}
          node={node}
          parent={location}
          inheritedReadOnly={readOnly}
          renderChildren={(children, at, forced) => (
            <FieldTree layout={children} location={at} readOnly={forced} />
          )}
        />
      ))}
    </div>
  );
  return sidebar.length > 0 ? (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
      <div className="min-w-0">{region(main)}</div>
      <aside aria-label={t.sidebar} className="min-w-0">
        {region(sidebar)}
      </aside>
    </div>
  ) : (
    region(main)
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
