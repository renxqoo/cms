export interface CollectionUpload {
  filesRequiredOnCreate?: boolean;
  mimeTypes: readonly string[];
  variants: readonly {
    name: string;
    width: number;
    height: number;
    fit: 'cover' | 'contain' | 'inside';
  }[];
}
