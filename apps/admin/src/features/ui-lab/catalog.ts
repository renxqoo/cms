import { componentRoutes } from '../../config/navigation';

export const categoryCatalog = {
  actions: {
    icon: componentRoutes.actions.icon,
    guides: [
      'Button',
      'CopyToClipboard',
      'Hamburger',
      'Link',
      'Navigation Controls',
      'Step Navigation',
    ],
  },
  inputs: {
    icon: componentRoutes.inputs.icon,
    guides: [
      'CodeEditor',
      'DatePicker',
      'Field Labels and Messages',
      'Text Inputs',
      'Checkbox and Select Inputs',
      'PillSelector',
      'ReactSelect and Select',
      'Relationship and Upload Inputs',
      'SearchBar',
      'TimezonePicker',
    ],
  },
  layout: {
    icon: componentRoutes.layout.icon,
    guides: ['AnimateHeight', 'Card', 'Collapsible', 'Gutter'],
  },
  feedback: {
    icon: componentRoutes.feedback.icon,
    guides: ['Banner', 'ErrorPill', 'Motion and Loading', 'Pill', 'ShimmerEffect'],
  },
  data: {
    icon: componentRoutes.data.icon,
    guides: ['Icons', 'List and Pagination Controls', 'Table', 'Table Cells', 'Thumbnail'],
  },
  overlays: {
    icon: componentRoutes.overlays.icon,
    guides: ['Draggable Sortable', 'Modals and Drawers', 'Popup and PopupList', 'Tooltip'],
  },
  documents: {
    icon: componentRoutes.documents.icon,
    guides: ['Document Actions', 'Document State', 'Dropzone', 'Upload', 'Upload Helpers'],
  },
} as const;

export type CategoryId = keyof typeof categoryCatalog;

export function isCategoryId(value: string): value is CategoryId {
  return Object.hasOwn(categoryCatalog, value);
}

export const categoryIds = Object.keys(categoryCatalog).filter(isCategoryId);

export interface CoverageRow {
  guide: string;
  category: CategoryId;
  scenario: CategoryId;
}

const guideTargets: Readonly<Record<string, CategoryId>> = {
  'Relationship and Upload Inputs': 'documents',
  'Draggable Sortable': 'data',
  Icons: 'actions',
};

export const coverageRows: readonly CoverageRow[] = categoryIds.flatMap((category) =>
  categoryCatalog[category].guides.map((guide) => ({
    guide,
    category,
    scenario: guideTargets[guide] ?? category,
  })),
);
