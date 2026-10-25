import {sql} from 'drizzle-orm';
import * as pg from 'drizzle-orm/pg-core';
const ref_content_revisions=pg.pgTable("content_revisions",{id:pg.uuid("id").notNull(),document_id:pg.uuid("document_id").notNull()});
const ref_content_documents=pg.pgTable("content_documents",{id:pg.uuid("id").notNull(),collection_id:pg.text("collection_id").notNull()});
export const table_cf_0a667456a824cb0c20c2221d = pg.pgTable("cf_0a667456a824cb0c20c2221d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a613a9142f77c0ac7732b867").on(t.revision_id,t.locale),
  pg.index("ix_aa77214f3deccb95937051c4").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_22e686460c226e1ee4eca42b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_21f6b86732a72abf00d33602 = pg.pgTable("cf_21f6b86732a72abf00d33602", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7d79e92d5990ebdae66e9d9d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d3708415fec81a3d69208025",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_b77e3d83737da872db722594",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_280f50f4a07d1f985ae45183 = pg.pgTable("cf_280f50f4a07d1f985ae45183", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_dd49413c692ec0c2036715b6").on(t.revision_id,t.locale),
  pg.index("ix_d49cc086e7a35274ec12fb3e").on(t.value,t.locale,t.revision_id),
  pg.index("ix_de0d62b97db6b79cc42ec1dd").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_ec57fd4ce678ffd369bb178e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3e0e80a7fcfece8499494729 = pg.pgTable("cf_3e0e80a7fcfece8499494729", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_6f853c45c124f80ce35dde14").on(t.revision_id,t.locale),
  pg.index("ix_713142a168d9df4c73d442d0").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_8f180ac8ffe6bc4a903e5f6a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_42da07b7f18f954621ae7ee5 = pg.pgTable("cf_42da07b7f18f954621ae7ee5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bea00b7d6a39c5e589110634").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5c2b08789d17eff8f05480b7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4feb0997e56246a822486a3d = pg.pgTable("cf_4feb0997e56246a822486a3d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c529cc5fe7a7e8c20732a0d5").on(t.revision_id,t.locale),
  pg.index("ix_c97ecc7bdd6d06a4e2d53daf").on(t.value,t.locale,t.revision_id),
  pg.foreignKey({name:"fk_a80297c9624f42355017f54f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_52372aed6ba38c9b2a3046b3 = pg.pgTable("cf_52372aed6ba38c9b2a3046b3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d5e5b0184614aa207b8377d1").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a5b09833b487e617510c4884",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8645764707487508dbdfe7bc = pg.pgTable("cf_8645764707487508dbdfe7bc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c51d54af19d524e1481abbca").on(t.revision_id,t.locale),
  pg.index("ix_cf143c9b4608adb7d8449faa").on(t.value,t.locale,t.revision_id),
  pg.foreignKey({name:"fk_981d31349f7ee6a1ccbd64fa",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_88216a9806aa317f2d47b3ad = pg.pgTable("cf_88216a9806aa317f2d47b3ad", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4609686e7e4715f9ff53058f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_26c7881fc008321f52c30f6a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8d4ab27c16c5eec057b3dac4 = pg.pgTable("cf_8d4ab27c16c5eec057b3dac4", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2bb2abfd35ba2a31446ed53a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_bc094d8f936880141a6c48b9",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9364ab8dd417df11b960c946 = pg.pgTable("cf_9364ab8dd417df11b960c946", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3a88f2ba457d5f0d3ecbc286").on(t.revision_id,t.locale),
  pg.index("ix_137a46e77226b3a6db9b42be").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_a719677a5f8367122b5cd292",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9af8ce6231cbfd87a30bbe1b = pg.pgTable("cf_9af8ce6231cbfd87a30bbe1b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8ede323584972a172626c303").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2f675627ea75ce9efba1ea59",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_3fe1ba54fe4113625f333945",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_b9c53070455cfc660071e87a = pg.pgTable("cf_b9c53070455cfc660071e87a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f5b5b074d62f92841cc6ea2b").on(t.revision_id,t.locale),
  pg.index("ix_8709f5ba2eaf8a97c3a0de55").on(t.value,t.locale,t.revision_id),
  pg.index("ix_2f75fc2691e80147d4fc1db6").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_a5ef083c8e81c353518f2c55",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_cfc695e6d66f296feb65bd73 = pg.pgTable("cf_cfc695e6d66f296feb65bd73", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e0391e47193e74053310c663").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_920757954dc1a9e62f9b2178",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_cfabec6aa532777096d8c467",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_f02fa48abcf081f19822bfc9 = pg.pgTable("cf_f02fa48abcf081f19822bfc9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_46bf870e28763d53c24e8398").on(t.revision_id,t.locale),
  pg.index("ix_a34aad597dc43548dda6a99f").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_ce0d5e3c6c8f703ac0e137f6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f7172e3130217995c9960995 = pg.pgTable("cf_f7172e3130217995c9960995", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8c6b455e1557487edc5bb7c6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d60b7aa4d3189d6f5f120e34",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cu_4b3157d1ad57acc25664c1b6 = pg.pgTable("cu_4b3157d1ad57acc25664c1b6", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_f525015f11a85b71b3cdbc8c").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_f525015f11a85b71b3cdbc8c",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const table_cu_d39b972415ec56d3b602e581 = pg.pgTable("cu_d39b972415ec56d3b602e581", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_adef3f37969bbb179117b763").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_adef3f37969bbb179117b763",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const contentMappingFingerprint = "bfea4f30faff51f03fc9473eb5fa9de1a98e21de57381b7930fba421d642d401";
export const contentBehaviorHash = "6897bacbb14e7750d5cd8ec6a48a5517b48e796340c9401d109338ef2160785b";
