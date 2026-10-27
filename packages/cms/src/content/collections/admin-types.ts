import type { AdminListContext } from '../queries/admin-context.ts';
import type {
  AdminConditionContext,
  CollectionPolicyContext,
  DocumentData,
  JsonValue,
  VersionedFunction,
  MaybePromise,
  LocalizedLabel,
  Where,
} from '../definition.ts';

export type AdminComponentReference = false | string | { id: string; props?: DocumentData };
export type AdminFieldComponentSlot =
  | 'Field'
  | 'Label'
  | 'Description'
  | 'Error'
  | 'Cell'
  | 'Filter'
  | 'Diff'
  | 'RowLabel'
  | 'Block'
  | 'beforeInput'
  | 'afterInput';
export type AdminCollectionComponentSlot =
  | 'Header'
  | 'List'
  | 'Edit'
  | 'Description'
  | 'beforeList'
  | 'afterList'
  | 'beforeEdit'
  | 'afterEdit'
  | 'beforeListTable'
  | 'afterListTable'
  | 'listMenuItems'
  | 'ListActions'
  | 'NoResults'
  | 'beforeDocumentControls'
  | 'BeforeDocumentMeta'
  | 'editMenuItems'
  | 'PreviewButton'
  | 'PublishButton'
  | 'SaveButton'
  | 'SaveDraftButton'
  | 'Status'
  | 'UnpublishButton'
  | 'Upload'
  | 'View'
  | 'ViewActions'
  | 'Icon'
  | 'SmallIcon';
export interface AdminFieldComponents {
  Field?: AdminComponentReference;
  Label?: AdminComponentReference;
  Description?: AdminComponentReference;
  Error?: AdminComponentReference;
  Cell?: AdminComponentReference;
  Filter?: AdminComponentReference;
  Diff?: AdminComponentReference;
  RowLabel?: AdminComponentReference;
  Block?: AdminComponentReference;
  beforeInput?: false | readonly AdminComponentReference[];
  afterInput?: false | readonly AdminComponentReference[];
}
export interface AdminCollectionComponents {
  Header?: AdminComponentReference;
  List?: AdminComponentReference;
  Edit?: AdminComponentReference;
  Description?: AdminComponentReference;
  beforeList?: false | readonly AdminComponentReference[];
  afterList?: false | readonly AdminComponentReference[];
  beforeEdit?: false | readonly AdminComponentReference[];
  afterEdit?: false | readonly AdminComponentReference[];
  beforeListTable?: false | readonly AdminComponentReference[];
  afterListTable?: false | readonly AdminComponentReference[];
  listMenuItems?: false | readonly AdminComponentReference[];
  ListActions?: false | readonly AdminComponentReference[];
  NoResults?: AdminComponentReference;
  beforeDocumentControls?: false | readonly AdminComponentReference[];
  BeforeDocumentMeta?: false | readonly AdminComponentReference[];
  editMenuItems?: false | readonly AdminComponentReference[];
  PreviewButton?: AdminComponentReference;
  PublishButton?: AdminComponentReference;
  SaveButton?: AdminComponentReference;
  SaveDraftButton?: AdminComponentReference;
  Status?: AdminComponentReference;
  UnpublishButton?: AdminComponentReference;
  Upload?: AdminComponentReference;
  View?: AdminComponentReference;
  ViewActions?: false | readonly AdminComponentReference[];
  Icon?: AdminComponentReference;
  SmallIcon?: AdminComponentReference;
}
export interface AdminComponentContext extends AdminConditionContext {
  componentId: string;
  slot: AdminFieldComponentSlot | AdminCollectionComponentSlot;
  props: DocumentData;
}
export interface AdminComponentRegistration {
  id: string;
  version: string;
  slots: readonly (AdminFieldComponentSlot | AdminCollectionComponentSlot)[];
  validateProps?: VersionedFunction<(context: AdminComponentContext) => MaybePromise<boolean>>;
  resolveProps?: VersionedFunction<(context: AdminComponentContext) => MaybePromise<DocumentData>>;
}
export interface AdminViewDefinition {
  id: string;
  scope: 'collection' | 'document';
  path: string;
  label: LocalizedLabel;
  component: AdminComponentReference;
  actions?: false | readonly AdminComponentReference[];
  tab?: boolean;
  meta?: AdminMetadataDefinition;
}

export interface AdminFieldOptions {
  readOnly?: boolean;
  hidden?: boolean;
  description?: LocalizedLabel;
  placeholder?: LocalizedLabel;
  position?: 'main' | 'sidebar';
  width?: string | number;
  condition?: VersionedFunction<(context: AdminConditionContext) => MaybePromise<boolean>>;
  disabled?:
    | boolean
    | {
        field?: boolean;
        column?: boolean;
        filter?: boolean;
        groupBy?: boolean;
        bulkEdit?: boolean;
      };
  components?: AdminFieldComponents;
}

export interface AdminCollectionOptions {
  baseFilter?: VersionedFunction<(context: AdminListContext) => MaybePromise<Where | null>>;
  listSearchableFields?: readonly string[];
  useAsTitle?: string;
  useAsThumbnail?: string;
  group?: false | LocalizedLabel;
  hidden?: boolean | VersionedFunction<(context: CollectionPolicyContext) => MaybePromise<boolean>>;
  pagination?: { defaultLimit?: number; limits?: readonly number[] };
  defaultColumns?: readonly string[];
  description?: LocalizedLabel;
  meta?: AdminMetadataDefinition;
  disableCopyToLocale?: boolean;
  enableRichTextLink?: boolean;
  enableRichTextRelationship?: boolean;
  formatDocURL?: VersionedFunction<
    (context: AdminDocumentURLContext) => MaybePromise<string | null | undefined>
  >;
  components?: AdminCollectionComponents;
  views?: readonly AdminViewDefinition[];
}

export interface AdminDocumentURLContext extends AdminConditionContext {
  documentId: string;
  viewType: 'list' | 'trash';
}

export type AdminMetadataDefinition = Readonly<Record<string, JsonValue | undefined>> & {
  titleSuffix?: LocalizedLabel;
  defaultOGImageType?: 'dynamic' | 'static' | 'off';
};
