export type JsonValue=string|number|boolean|null|JsonValue[]|{[key:string]:JsonValue};
export interface Relation {collection:string;id:string}
export interface DraftData {
"articles":{"title"?:string | null; "slug"?:string | null; "summary"?:string | null; "body"?:JsonValue | null; "cover"?:{collection:"media";id:string} | null; "related"?:({collection:"articles" | "pages";id:string})[] | null;};
"media":{"title"?:string | null; "alt"?:string | null; "copyright"?:string | null;};
"pages":{"title"?:string | null; "slug"?:string | null; "body"?:JsonValue | null; "parent"?:{collection:"pages";id:string} | null;};
"settings":{"siteName"?:string | null; "description"?:string | null; "contactEmail"?:string | null;};
}
export interface PublishedData {
"articles":{"title":string; "slug":string; "summary"?:string | null; "body"?:JsonValue | null; "cover"?:{collection:"media";id:string} | null; "related"?:({collection:"articles" | "pages";id:string})[] | null;};
"media":{"title":string; "alt"?:string | null; "copyright"?:string | null;};
"pages":{"title":string; "slug":string; "body"?:JsonValue | null; "parent"?:{collection:"pages";id:string} | null;};
"settings":{"siteName":string; "description"?:string | null; "contactEmail"?:string | null;};
}
export interface ReadData {
"articles":{"title"?:string | null; "slug"?:string | null; "summary"?:string | null; "body"?:JsonValue | null; "cover"?:{collection:"media";id:string} | ExpandedDocument<"media"> | null | null; "related"?:({collection:"articles" | "pages";id:string} | ExpandedDocument<"articles" | "pages"> | null)[] | null;};
"media":{"title"?:string | null; "alt"?:string | null; "copyright"?:string | null;};
"pages":{"title"?:string | null; "slug"?:string | null; "body"?:JsonValue | null; "parent"?:{collection:"pages";id:string} | ExpandedDocument<"pages"> | null | null;};
"settings":{"siteName"?:string | null; "description"?:string | null; "contactEmail"?:string | null;};
}
export type ExpandedDocument<C extends keyof ReadData=keyof ReadData>=C extends keyof ReadData ? {id:string;collection:C;revision:number;versionId:string;publishedVersionId:string|null;trashedAt:string|null;folderId:string|null;createdAt:string;updatedAt:string;data:ReadData[C]} : never;
