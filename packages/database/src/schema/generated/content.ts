import {sql} from 'drizzle-orm';
import * as pg from 'drizzle-orm/pg-core';
const ref_content_revisions=pg.pgTable("content_revisions",{id:pg.uuid("id").notNull(),document_id:pg.uuid("document_id").notNull()});
const ref_content_documents=pg.pgTable("content_documents",{id:pg.uuid("id").notNull(),collection_id:pg.text("collection_id").notNull()});
export const table_cf_0088481c341041835b7af0b4 = pg.pgTable("cf_0088481c341041835b7af0b4", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_da1f5f3534b8a748f5f5aa6f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4c04d8f0b30b9a80a52ae0ef",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_00b4f45510db45cb2c850e5b = pg.pgTable("cf_00b4f45510db45cb2c850e5b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ef9a84a577831d81f0dbcc34").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1cba11672c247cdac397f6ab",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_013660f332f61d68db2208e0 = pg.pgTable("cf_013660f332f61d68db2208e0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_442273fbc84855adec10dbd5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5775a6d8b7fa25fa21dd6d4b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_01da1cb2eb901be340107314 = pg.pgTable("cf_01da1cb2eb901be340107314", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4671255636bfe663034df99b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_281577241070b9136cf66fe4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_02526c8b30d43e90ac7a0d21 = pg.pgTable("cf_02526c8b30d43e90ac7a0d21", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d72eebddb4194aed6b0bae2a").on(t.revision_id,t.locale),
  pg.index("ix_443b9ebe82f94a591f1b94d8").on(t.value,t.locale,t.revision_id),
  pg.foreignKey({name:"fk_c433626d9a42b835e4d61eb2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_028c0db9a63d86d772a3efe7 = pg.pgTable("cf_028c0db9a63d86d772a3efe7", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b5b6ce00be147eb0043af5ba").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c2b9a776022897b3835561da",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_034568ea85ac572096be2729 = pg.pgTable("cf_034568ea85ac572096be2729", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3fa287eda689f20570650f39").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e65e1c79a2430abfbb6958bf",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0351104188c7478a52a42fb3 = pg.pgTable("cf_0351104188c7478a52a42fb3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ddb9d5a21b8847435b82d7c0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a7879b9215f9519402bbd684",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_035a3fe01de39d0cd4449d57 = pg.pgTable("cf_035a3fe01de39d0cd4449d57", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_126c08b3836eafd8a2575384").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c05231059b3d972992620bea",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_03e7ff32590dbaed6ea42fa0 = pg.pgTable("cf_03e7ff32590dbaed6ea42fa0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e5b0742ffbd97c578af10458").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_57c11ff92b3c127e6cfc90b0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_03e9a644899e99d2f08d790b = pg.pgTable("cf_03e9a644899e99d2f08d790b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d5c55543f8a4a422a65a7ebd").on(t.revision_id,t.locale),
  pg.index("ix_0a259ee25cee007878f7330a").on(t.value,t.locale,t.revision_id),
  pg.foreignKey({name:"fk_85984c3d38d66f7897addf0e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0416cab8460eb6479c4c7ead = pg.pgTable("cf_0416cab8460eb6479c4c7ead", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2007742083b9c62af34e4188").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_763ab0469a9e79cd3bacba91",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_043456302eb885af5d0321b2 = pg.pgTable("cf_043456302eb885af5d0321b2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b455177f615c007571b84cb0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e0343ca52605366d6164c34d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_04ef5d8bd3cd1a67bcc8e094 = pg.pgTable("cf_04ef5d8bd3cd1a67bcc8e094", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e2e9705f89f11121e7c5e2c4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6a4840c36acc7a69095f98b2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_05599eb4ede4827c775ba01f = pg.pgTable("cf_05599eb4ede4827c775ba01f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0e848f5bc77e78dab4da5ec7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_88f1ead34cd4dc9661c364d3",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_05cbfcc9e119cc4362ebd16c = pg.pgTable("cf_05cbfcc9e119cc4362ebd16c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_adf93211a539624ca2506e97").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f37c298df93eafd7fedd07e7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_05fc51d4aa2542d68da21a5f = pg.pgTable("cf_05fc51d4aa2542d68da21a5f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_84a213c9639272f49833947e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_227eec402e20cad50b1dd501",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_064b5731ef2860dcbe324722 = pg.pgTable("cf_064b5731ef2860dcbe324722", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2a5c39c7da4c970dfcb3de04").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_213b60f16eb78c6024582009",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0665325b992e64aef17f0260 = pg.pgTable("cf_0665325b992e64aef17f0260", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2a834e3c8c8fb4c895310da5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0bb109db9e7bbcdf6d553f94",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_06d3b3cead47cf5018a18095 = pg.pgTable("cf_06d3b3cead47cf5018a18095", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cfb39771324bec12d682eac0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_953053504442eb4b28d18091",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_07ce935fb863661f9758c36b = pg.pgTable("cf_07ce935fb863661f9758c36b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f820b0cde7650faeb5a29783").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a4d5463d33e6eac52228ed62",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_081730d4d8c8bc3ac0b49f59 = pg.pgTable("cf_081730d4d8c8bc3ac0b49f59", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a7ee119d97db9ed8e34fc5bc").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8bdd92f4a71a97632294e247",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0862108f90ac59241b44ba56 = pg.pgTable("cf_0862108f90ac59241b44ba56", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f7e4e09a7201edd18e7a2ff3").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a4ec34e9f667d5875be96978",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_08a0f239446f2d4810223e6a = pg.pgTable("cf_08a0f239446f2d4810223e6a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_97a771226b8d351cdb6dc658").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fb744169794fbe36ad7db68c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_095330afb546397dfb0302f3 = pg.pgTable("cf_095330afb546397dfb0302f3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0ceb529e71dba7e237db3bae").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6b5f349eb6246101320aa910",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0968ddf7208e7920bae93f0a = pg.pgTable("cf_0968ddf7208e7920bae93f0a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4902b9202a1af7e4274c03c7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_378320f1f8fffea66c24aeb1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0a632dda66cdc288b1378480 = pg.pgTable("cf_0a632dda66cdc288b1378480", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_816d2f13f8755ad91ca965ca").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4c23790704c324f6919d56c8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_0aaf95060c21fd2bb8a264a9 = pg.pgTable("cf_0aaf95060c21fd2bb8a264a9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_13c8b5301b0c22d024f83777").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7999196b32a2596fb98640fa",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0b34f1a93a006b2e27aa3ac1 = pg.pgTable("cf_0b34f1a93a006b2e27aa3ac1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_20511b6899ad9bda96d06f54").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7aabb9ce3a2ad22bbadcb11a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0c3c9f553e651f0ef585cf73 = pg.pgTable("cf_0c3c9f553e651f0ef585cf73", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_720d55d48476419346970c7d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_86dc31e89089228dd39c97b0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0c41951bb142487db555ddc0 = pg.pgTable("cf_0c41951bb142487db555ddc0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2243277fdcd1ee41582522ab").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_448dc919a96e7e4e56f0eb5e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0c5a8ec55a1d3c4f5ae4d434 = pg.pgTable("cf_0c5a8ec55a1d3c4f5ae4d434", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_158722b9513ff4298a6ca8b0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_10fd643a555a75f8738ad79b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0c862abe4d2c4eb722e8ae41 = pg.pgTable("cf_0c862abe4d2c4eb722e8ae41", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e83c280399df7f732d574c8e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6cff4644ca49c178470d7c6b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0d7a68fa3e7dd79567999eca = pg.pgTable("cf_0d7a68fa3e7dd79567999eca", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_615c329f9045198774472ef6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_98d8eb86e5f6edd1a3952a86",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0dc5036da550a8b4af4a08ee = pg.pgTable("cf_0dc5036da550a8b4af4a08ee", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0e9de44ae2dccbe56eb975d7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_84e2783bd8e2edebb710ae64",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0de211e03f8f00e9e7570d1e = pg.pgTable("cf_0de211e03f8f00e9e7570d1e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0ab537effc50a7f12addf8a3").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d9241518cb919cb50021f4c2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0e31d3d9cd60a082fef639e5 = pg.pgTable("cf_0e31d3d9cd60a082fef639e5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e9a1106af174f047ef26c35a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d52812a0141444cdd4345e79",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_0f428cc5f900d0459d75e73a = pg.pgTable("cf_0f428cc5f900d0459d75e73a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_133d3f7d5842f59a2ec6ecc9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e923ce74e9a9f98922b69fe3",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_101c779e9044ebee2331ab36 = pg.pgTable("cf_101c779e9044ebee2331ab36", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_462474bd759a2a7bec5d93f9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_44d054aa423882ab46059fcb",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_10c9513516869b7fbd5777e4 = pg.pgTable("cf_10c9513516869b7fbd5777e4", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d1052c4e62f21b180debd64c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0e394070381f0128d3c5b298",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_110af125511b667dd0725c1b = pg.pgTable("cf_110af125511b667dd0725c1b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2ed4549fea113f1d84f95bff").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_16f4fef2b7084fad5c235a21",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_0d0309ff633b0e7276e3b394",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_1167a6c50226465061910ce8 = pg.pgTable("cf_1167a6c50226465061910ce8", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1fed4b12b846c9f3291db3d0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_822178350f80ceccd530f67a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_11a883f71b96b223bfbae7e4 = pg.pgTable("cf_11a883f71b96b223bfbae7e4", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ade03cdd3298d97e1ce84f4a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8f06395693404426aea4b22d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1255b32294cf1e119641e206 = pg.pgTable("cf_1255b32294cf1e119641e206", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e4c4dd5af4b7e101abaca167").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e537cbb2510e5479be09de96",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_12ae96dabe1bc0ab0a98f2dc = pg.pgTable("cf_12ae96dabe1bc0ab0a98f2dc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_040d73067c2f265c6a42f3c8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9737410b86c147a209e7925d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_131fe365cf32cab6a5fc4545 = pg.pgTable("cf_131fe365cf32cab6a5fc4545", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_72b50758728fdae195ea6f8b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_86f5e95563831878d6f561af",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1346b044569a6a03efbf73b9 = pg.pgTable("cf_1346b044569a6a03efbf73b9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1909ac9eee77f0c3f1ad1740").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_90e5c351984be72d933bb19c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_138c87146ebbd594e4d063bc = pg.pgTable("cf_138c87146ebbd594e4d063bc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_88842b70fbf9c276f19b9842").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_eb3d2c35445ca6d256438cba",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_13c36a841d39cdacbbcf2495 = pg.pgTable("cf_13c36a841d39cdacbbcf2495", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7f089a5ada484e150ce84e9a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e0a5dd66ab19cc4960f1cd64",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_f31911d13ee665ae29ee1fd2",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_140a85b4b7d1be0b64f68725 = pg.pgTable("cf_140a85b4b7d1be0b64f68725", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a0103309b786be447b027c33").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e46832e76d12f9720febbf16",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_149fe3550b2faddf65920c38 = pg.pgTable("cf_149fe3550b2faddf65920c38", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_231539604438447db33a3ddc").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_41352ac1bee27e64258399cc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1529f5876d166e50e95b085e = pg.pgTable("cf_1529f5876d166e50e95b085e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9f50e98513973957a8bc69b1").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a8e8532a48055c8b36001110",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_16dcb943b322f30bfba992b6 = pg.pgTable("cf_16dcb943b322f30bfba992b6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a315407b3bb67c3d4f6ccfb9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_783529737007df5541771a30",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1732874fbee749f693497402 = pg.pgTable("cf_1732874fbee749f693497402", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c45c2bf25a48e9094b46c0d9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6f3d6011bc144eab90b7ca33",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_18253db0cb8bf648f802e623 = pg.pgTable("cf_18253db0cb8bf648f802e623", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7d2560dc14b92f144ac445e1").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a8276a111e5ee6bb65daaff1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_188540fe3ec6467a2eb7fbdf = pg.pgTable("cf_188540fe3ec6467a2eb7fbdf", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8ac82f565585059ec686b346").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3cfd8b34306b93413d72d658",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_18e7fee35d5c288d74afca6c = pg.pgTable("cf_18e7fee35d5c288d74afca6c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4ba1437b060664c3181969fa").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7201e5b8edc4a11142507f42",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_198b7a95645b8c461a55d13e = pg.pgTable("cf_198b7a95645b8c461a55d13e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5836a91868446f8a5f186373").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_930c9815ab73c4d3edb30d67",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_19fbbb513c2f0c015cb75b8e = pg.pgTable("cf_19fbbb513c2f0c015cb75b8e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e808b33f58f336d01cb8f8ed").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_57e385f5285079e6da6111db",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1a8e738fe8b8c3dbf05c9893 = pg.pgTable("cf_1a8e738fe8b8c3dbf05c9893", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7d2d817f45b51f1ef0ed95e4").on(t.revision_id,t.locale),
  pg.index("ix_5a1b477c5d2962f054a82204").on(t.value,t.locale,t.revision_id),
  pg.index("ix_1d7544c0840479455da96c48").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_aab5578f15a6b5f0b44fbede",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1ab0baea22787ccdbd06fb77 = pg.pgTable("cf_1ab0baea22787ccdbd06fb77", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_91872f9703efbeebb06e1f4e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c6d576a3a78521fc292e578a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1c0b51097d970e1d873884c0 = pg.pgTable("cf_1c0b51097d970e1d873884c0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_78a1c2469d8ed2b3a92cd3d7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ed2908ed61534fc150d1a65a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1d4975c250c23905f8440cc0 = pg.pgTable("cf_1d4975c250c23905f8440cc0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ae41d9a82ed12e6c3484848a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_02eab03b247ebf30c42197cb",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1db4837dab49866ed3e07ee8 = pg.pgTable("cf_1db4837dab49866ed3e07ee8", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d27253a1edbbf964c573e8a0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_789c5e74dfd6eeda50ac0809",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1dc3fc0b8c0755b22f09b979 = pg.pgTable("cf_1dc3fc0b8c0755b22f09b979", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8b315175565bcc0755076faf").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_dc6b4a3c09c35607cbfe2cc8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_6ad56185c5d86a31e05bbe2d",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_1e43f3c6788b75014d261bfc = pg.pgTable("cf_1e43f3c6788b75014d261bfc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a1a0ae96694de072b1aa093e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_605046238277ff771e1107ee",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1e6f761b19557f5adb0bb7fe = pg.pgTable("cf_1e6f761b19557f5adb0bb7fe", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5189706a376394bd24a3379b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b1b51ff126832e7c94d46100",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_1f6d9defeca97b1a8a4910f9 = pg.pgTable("cf_1f6d9defeca97b1a8a4910f9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_02b242c6f20d09865e72eb17").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b380567a179f59b846456e35",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_20b7f3a573dedf62a61e306a = pg.pgTable("cf_20b7f3a573dedf62a61e306a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4de71c8e231cc814ed0863be").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_147667fc838d4021977b594e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_20e0f52d34f288d84658114c = pg.pgTable("cf_20e0f52d34f288d84658114c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_33549af486047eb448f044d7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5a5d737812e1e6774ad24a89",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2138014f84238acd889fdd70 = pg.pgTable("cf_2138014f84238acd889fdd70", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8d6260895e091d122987c661").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ccfa03b02a6a9510f535fd4a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2178911f7109da59c7681d4b = pg.pgTable("cf_2178911f7109da59c7681d4b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_703618a3351a749ef82e4cff").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_02aa68a2a8f2e798fb15cd83",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_21d6289cee17c7d4aeca0c4c = pg.pgTable("cf_21d6289cee17c7d4aeca0c4c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9346564712193b02dafc3432").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e5e8400b5bba2e99f61f65d0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_2287d8abf123acecbc772176 = pg.pgTable("cf_2287d8abf123acecbc772176", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_59dca234dce08b26f887e79d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5b67de64a5f0af49ab0bc61d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_237019001b0c9087308a831d = pg.pgTable("cf_237019001b0c9087308a831d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b29b5b96c52d442df62cb269").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b7b8ffa585ba66668d1ee031",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_23821814e722ec42f9d21735 = pg.pgTable("cf_23821814e722ec42f9d21735", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2b43c317c0c5f130872fc1be").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a73dcb3eb8229f26ee7d9e1b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_238285f12352e4483121497b = pg.pgTable("cf_238285f12352e4483121497b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_622e0cbe9259244f10c81207").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8846fc32e6a257d7533d45d4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_248cfa467914ba2a96287712 = pg.pgTable("cf_248cfa467914ba2a96287712", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ad765521ec6dd120c7bb6751").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c6a9e4e764ca76cb7c06996a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_24d65d1b4a13b1fe1585d094 = pg.pgTable("cf_24d65d1b4a13b1fe1585d094", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ef65cff774c1946ad4213f61").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a34bd33a4651f6fbec2cc0c0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_25455b0366e443ae91257a72 = pg.pgTable("cf_25455b0366e443ae91257a72", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_073bd53ff28238a05a5c3d2f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e9ec6a7777a750f9478f8bd4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2574f9c7b7f77739027538d7 = pg.pgTable("cf_2574f9c7b7f77739027538d7", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bdfec808ddffb31072c7c0da").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_346442b9b469635d6c7f837e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_26ce048be930e7b99003b242 = pg.pgTable("cf_26ce048be930e7b99003b242", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_95c543c5d3f0f79e953d799c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0329ce573c109500dc92e2af",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_28b82a4b28904a919cb7ecb5 = pg.pgTable("cf_28b82a4b28904a919cb7ecb5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f82d98612ff6b9428367ba68").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_742c48a2a1969620a4e5e22b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_293132e6d9b505e56df7bee8 = pg.pgTable("cf_293132e6d9b505e56df7bee8", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bed0f9458e354c82f8a7e820").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cbd65ac85fe687704aa6a99c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2988081ab8d0073741fbead0 = pg.pgTable("cf_2988081ab8d0073741fbead0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e68ada69b620399611269952").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c437fd86167f14d1c8ba40ae",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2a38a0d3dca39762985784e6 = pg.pgTable("cf_2a38a0d3dca39762985784e6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_73fcd9505ec927b902713822").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7790d10770cfc9feab424b52",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2a74dd9a959fbec209271f9f = pg.pgTable("cf_2a74dd9a959fbec209271f9f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_36a2017044725fc827980e95").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_67de708f69d1e2f5ba4a5d62",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2a9b85d7546bf4bf333108b5 = pg.pgTable("cf_2a9b85d7546bf4bf333108b5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4f51c0361195bade0376b6c1").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2edd0fb9f33b7d67d54fb8dd",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2bd929dddd2a3fcd11ae7e42 = pg.pgTable("cf_2bd929dddd2a3fcd11ae7e42", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e308d1a04a9fc8e3a5960427").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_056ba81e840cbe26d70dfaf6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2d6043574bf344c9a3959fc2 = pg.pgTable("cf_2d6043574bf344c9a3959fc2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e28cf6f5a41d7fac73d7ba71").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_70a7949ab6cb5d236053c1f9",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2dddddf101b770776dde37c2 = pg.pgTable("cf_2dddddf101b770776dde37c2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d7da102d27440e5d572c94a2").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_da16aadfc243054578190946",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2e45112ec999e6940f98fd5b = pg.pgTable("cf_2e45112ec999e6940f98fd5b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_da208b5b91174d1cf5f6aa8e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_16df582e51c2ba9b27796007",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2e6dd2bd4b13b9f464eff792 = pg.pgTable("cf_2e6dd2bd4b13b9f464eff792", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8d46cab14a27e5e23e016949").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8ae3564c4d728df8a9eea4f5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2f8d9ea95d6452e244cc358e = pg.pgTable("cf_2f8d9ea95d6452e244cc358e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b4506a65f58c604dd5e2a23e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a5c95e2ef4528f3a5588de65",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_2fd040e467b4dd00e9db277d = pg.pgTable("cf_2fd040e467b4dd00e9db277d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9be57a2ef76c60c5a9b65d85").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c2aaf50eb30d7562d7c4be1b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_94b5efbdf21ecb738884056e",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_3238ff8503409b88248b8ddf = pg.pgTable("cf_3238ff8503409b88248b8ddf", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ba0578bb6356a794873ad683").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7f51d4aa60b6386f3bc6b8bf",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3252fe55ae60db51fab10de1 = pg.pgTable("cf_3252fe55ae60db51fab10de1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_adb0559319955fc43d2061f9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a4ab012c4cc8fd56db33db86",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_32e2bef3231c3f65d2909935 = pg.pgTable("cf_32e2bef3231c3f65d2909935", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_6a303b91dbb6f125c5cc07ca").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f6ad92b7c1b7ca7d125b787d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_330ba783f556682237656a3c = pg.pgTable("cf_330ba783f556682237656a3c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_21825c473df71fff97d7fdab").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6f31e6219ceff8fdaf821966",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_332f822bb18e4237e5556066 = pg.pgTable("cf_332f822bb18e4237e5556066", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1e2e4fd01f50c4aa681e1f4b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_852ad156f784a0b50f05de13",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_33335232627c58d0714df000 = pg.pgTable("cf_33335232627c58d0714df000", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8232479ea30a40f9e84e3635").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7a1ce054482e661fc6890a5d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_335c396fbebf683a6a574e2d = pg.pgTable("cf_335c396fbebf683a6a574e2d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8aaf0b1e6c9ba44e6345f464").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e3859ef8d5ca96699f5c4361",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_33fcd0e17fc4d87e432ebab0 = pg.pgTable("cf_33fcd0e17fc4d87e432ebab0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5645b6cc21a74ea48a8f2a42").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_57f4e154c211666fd25e80ae",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3550594e7cc2e7c620594e80 = pg.pgTable("cf_3550594e7cc2e7c620594e80", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_fa9acc7a4a8bc78220bc0764").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3191332f3dec526540a1f8cf",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_356bcc11d8223066a44a8549 = pg.pgTable("cf_356bcc11d8223066a44a8549", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c44bd10ff311d39da2f99a2c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_29a023880a4a6c90b1ca89d4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_368d7b6214f8656b5ca44d3f = pg.pgTable("cf_368d7b6214f8656b5ca44d3f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4b221cf586f682df677c31b8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1f0afc2b647352380d9d2e5d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_36a7eba29b9bbbffa875de3b = pg.pgTable("cf_36a7eba29b9bbbffa875de3b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b977cecceb5a6d294bb52eb6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3eee68681cddbdb9becb7a3a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_37915e4bb90105ceca0f420f = pg.pgTable("cf_37915e4bb90105ceca0f420f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_866fba69302ba51ac4a010a8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_72a7dd21dc7342f6fe7a08de",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3850cc5bd69b1426ed29bd2d = pg.pgTable("cf_3850cc5bd69b1426ed29bd2d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2dab9a2bf52b9cda5f7d73e4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c7cbeb4f9c70042e7dad9771",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_38c2e5e9c9ee9dadda6b1dfc = pg.pgTable("cf_38c2e5e9c9ee9dadda6b1dfc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d6c8056efa8a36e2338e3a2e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7bdae08de5dbbcc50ad39ee8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_38d016379831a6d433810f77 = pg.pgTable("cf_38d016379831a6d433810f77", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_22459ef6951f7ddb960499d1").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f229e38d7f4f28842003b93b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3904379077f3e6bac976e5da = pg.pgTable("cf_3904379077f3e6bac976e5da", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9e74b3ad52c5e9dc66ca15ee").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_30ca09563e36f7c891284c3e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_39b86b5e45393fb9ca43556c = pg.pgTable("cf_39b86b5e45393fb9ca43556c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cb078ee7560a89523cb4491f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_498f9bc42306611b558c806c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3a8c243bd2da571399be9450 = pg.pgTable("cf_3a8c243bd2da571399be9450", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_fd98ae26cdac3c5b6094dcd8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d3d66acde94f0f0a8fd399ab",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3aa9d4a6389f5967a26f9444 = pg.pgTable("cf_3aa9d4a6389f5967a26f9444", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_876fd74bbfc8751fca25ff1f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e891e2227f454554b4d67ddc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3c9adecf03e264ddbc04e168 = pg.pgTable("cf_3c9adecf03e264ddbc04e168", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0f9b048448382da10245ebd9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9ec937c749e799e309efdd08",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3cac89938439b6b4ac8d5174 = pg.pgTable("cf_3cac89938439b6b4ac8d5174", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_752de8f4929435f085b2d977").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_eb239782fe6755f17c113215",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3ce2e154f386bb4879063256 = pg.pgTable("cf_3ce2e154f386bb4879063256", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_16c42a8d1a6af2c654fb0d88").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_daa2ddbab95670140ee7ad59",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3cf3dd55e6e7e14e25a47a33 = pg.pgTable("cf_3cf3dd55e6e7e14e25a47a33", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_143aabb9d9513704ef43ca80").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9e07f2c0820cf4618398f081",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3d6c4ec3db1186eec0a17261 = pg.pgTable("cf_3d6c4ec3db1186eec0a17261", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_40d15ecc82b929ce4845ac0e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_13f714af83c3ec7bf6441458",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3dd29a566678be98b8e22259 = pg.pgTable("cf_3dd29a566678be98b8e22259", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1c48a93e1acf22c6ac2e3339").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d8d946a2b628bc4cb019d62c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_3e8c1aa7f708a050db0b7793 = pg.pgTable("cf_3e8c1aa7f708a050db0b7793", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_038673c84c6c5a36399c7776").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a582bcc3dc729ec824437e7a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3eb26942674108e1dd45249c = pg.pgTable("cf_3eb26942674108e1dd45249c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a7423a8235b1dd849c4849eb").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0bddd8d24982977fe0e81716",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3ecc00f4a9f2461ff760c936 = pg.pgTable("cf_3ecc00f4a9f2461ff760c936", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e77ec6ecce9e72e71b83ac33").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_748eca1e1b25e80f85d935ac",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3f00440b3e9cea131ad6c915 = pg.pgTable("cf_3f00440b3e9cea131ad6c915", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d9c608fabdbd85571d89dfc2").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9705b11e592a6d0c8a668236",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3f3d39bdd545689d6a777c47 = pg.pgTable("cf_3f3d39bdd545689d6a777c47", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ee9acf6a91fbd2184108cd25").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b8b514a7c1c3f40182ebc403",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3f7ec79916ee43b030269b8e = pg.pgTable("cf_3f7ec79916ee43b030269b8e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_07f684f0242fa5fbb6c04616").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_442a18eaf53812f84dd6f3f0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3f8756c5756b73435aeac340 = pg.pgTable("cf_3f8756c5756b73435aeac340", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8752e80d3a948d7d1e7c1883").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1db1dc5882520c2f8be08172",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3f9d02fff8ffcaa8dcf2cff2 = pg.pgTable("cf_3f9d02fff8ffcaa8dcf2cff2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3261a3543982b56ff5cfec90").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b8a1baa19fbe89f6bd599ef2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_3fc05503da9eea0a8650f161 = pg.pgTable("cf_3fc05503da9eea0a8650f161", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f8bb6a343aec59c5c8db903f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f148f02c2f6d11c070099224",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_76f3f1984f1ef9b08de362ff",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_3fe98a9f63b96cc7a93bb5ef = pg.pgTable("cf_3fe98a9f63b96cc7a93bb5ef", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3738785215cdd635f6ea93b5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_15c9fd1d99c20301c5c1c3fd",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_404280873717e4fe9c92a62b = pg.pgTable("cf_404280873717e4fe9c92a62b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_113cf1a886b9176768be7274").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b3c752c19a033fc6e25a93fe",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_40c14082e7702706ead21a17 = pg.pgTable("cf_40c14082e7702706ead21a17", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d46c1348347c1e3205f2a076").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d46224325dfb374e0310e8d8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_40ee2a20147ca7b6ef3474c2 = pg.pgTable("cf_40ee2a20147ca7b6ef3474c2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9258f0fc50e61e13c0c5cebe").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9234548b4b6c20d4496df069",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_414b6e47e2994f3c5ff93162 = pg.pgTable("cf_414b6e47e2994f3c5ff93162", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bfbaaac560c8c87bebeef85f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5fb9f3ec94188789bdd535b1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_41a85911b17b231c892ce6e6 = pg.pgTable("cf_41a85911b17b231c892ce6e6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_72daadbf10dc187c2588d2be").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ba3d8a14d4f3d2086a47ff3b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_41d38ca8aedf95e27993e478 = pg.pgTable("cf_41d38ca8aedf95e27993e478", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e1c7f065a0c6cd2c035640e8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_47b0e3ddccc46af13a2a3165",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_422cda15bd8ddeba12d83059 = pg.pgTable("cf_422cda15bd8ddeba12d83059", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ce29f0ae5e8a50ec85cf2d18").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_05bd82dca7b16c5751db749e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_7d0d7dcdf5f17cc28b741252",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_428b05d8335c40c487e8628d = pg.pgTable("cf_428b05d8335c40c487e8628d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_eeb56d2dfb8dc8ff3d31b4c7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b395b72db78cea83d671574c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_434e3965dfdae99099915cd3 = pg.pgTable("cf_434e3965dfdae99099915cd3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f2237ded9d543e8730741a3f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c6a2326f682e9a478ccd6333",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_443cccfc9d741d664b09a23d = pg.pgTable("cf_443cccfc9d741d664b09a23d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1089c19ec47f787121014ff5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ebd1dae240b6efa3ee0561f4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_45c2373f96a39ec9a9f2334b = pg.pgTable("cf_45c2373f96a39ec9a9f2334b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_6672f84368142beade5ca9bf").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_246b9f8f07df1be5ca233c97",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_45c35924403ff85a2d3fe4c1 = pg.pgTable("cf_45c35924403ff85a2d3fe4c1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_df9ff9524a9a4633364944d3").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_bd129d7defd8d592803eb318",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_460cbf80cd8ef5c7aac14b1e = pg.pgTable("cf_460cbf80cd8ef5c7aac14b1e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bc3b7d347871a8b8c3e2d249").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_55703708af85a03cd5ec94c7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_462a302a04a76c5c121b6f5f = pg.pgTable("cf_462a302a04a76c5c121b6f5f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5cf6111cd6b4d8a32ad79440").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9499c0c58f038eef725a1d36",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_46faabe28dde80aae6de81ac = pg.pgTable("cf_46faabe28dde80aae6de81ac", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_59cc1ed9ec48c69acefee64b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_41308232c5821a23905b73d2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_83f288dc0ac207d7a987a8c6",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_46fc8fb322402de542c46884 = pg.pgTable("cf_46fc8fb322402de542c46884", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_be6996fcbf5ecc8b41db6a0d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_199d099aee44cd2af6c33ed2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_47baffba05437a07fa8278df = pg.pgTable("cf_47baffba05437a07fa8278df", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_530ce73e626e74ffcce69ae4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0b3454f453dcabac3efa7bb8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_494c7cda747c8960d059df3a = pg.pgTable("cf_494c7cda747c8960d059df3a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4edfb9ba560202a19a66071e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0bf6a2f243fffa69da7469f5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4a7768ff77d66009484ef92d = pg.pgTable("cf_4a7768ff77d66009484ef92d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2231bf98194d8cbe1b4e28fc").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f7dba9cd39ca88d77dc7cdd1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4a9a6bda82348a7e6d5f5627 = pg.pgTable("cf_4a9a6bda82348a7e6d5f5627", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_87856270577ee3ea08198941").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9e536fbf6a8434579e203a58",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4c0615eb0a2959c12e3542ff = pg.pgTable("cf_4c0615eb0a2959c12e3542ff", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2c26d8324f11e65e9213770a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d1e4e687ca8a7e6b393f9798",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4c16614d0990fc8913887671 = pg.pgTable("cf_4c16614d0990fc8913887671", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_13c59c67a4cf9b690d5d29d4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9df53337960f3a2c6ba4d38b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4cfdbddd685252ef93bd55e3 = pg.pgTable("cf_4cfdbddd685252ef93bd55e3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0f1cbe85b45e17e01b2b31ee").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5b9766dfc8132f736a7c9fea",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4e58491139a1a18a3df9fe27 = pg.pgTable("cf_4e58491139a1a18a3df9fe27", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3e58875f61f1bbc96a23ce19").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a11ec82023294736c9e30583",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4e758fc6fcd9f43f53f598ff = pg.pgTable("cf_4e758fc6fcd9f43f53f598ff", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_52d19fee2ece4ec8ab92d38b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f8ab4431caa9b4eaae7cd3cc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4f101a06527a0fdf8f88ef1f = pg.pgTable("cf_4f101a06527a0fdf8f88ef1f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c4b7b939acf415266e795d00").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c825720c6d86e3824b342875",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_4f7ea6bb6cf18d6fde400f01 = pg.pgTable("cf_4f7ea6bb6cf18d6fde400f01", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0ead955dfc9cf454effb37c9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4c737367f5e055c280a18765",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_5135fc474348dbf66b1a04bd = pg.pgTable("cf_5135fc474348dbf66b1a04bd", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7e1cbc5943d42109d6b36aed").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_eb81af5f3150b5007dd63fff",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5173e268ed0203ea1c3f785a = pg.pgTable("cf_5173e268ed0203ea1c3f785a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_38d521416947bfb3ee7ed9ce").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c2502993b8d4441172384ef3",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5174def21822925667afbcbd = pg.pgTable("cf_5174def21822925667afbcbd", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ae237df0cd87e7580cbaaa23").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_613a3e4c0be618dd049e832b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_51e979784df0a422a5e982e6 = pg.pgTable("cf_51e979784df0a422a5e982e6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4cd4bcdeea7dc808d1f03588").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_31b58ab4917f1bf776467703",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_530314ddcc3a3121654caf8e = pg.pgTable("cf_530314ddcc3a3121654caf8e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c53de82fb407c36328a36de2").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0a192753d9fd9f0c53bca78e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_544d8bdcd206fd0ff74cd432 = pg.pgTable("cf_544d8bdcd206fd0ff74cd432", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_39d3d3d32b3d38b1b9be45af").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_27ba50d3ff7682cbb4fffddb",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_545a95c2bbb417d95e4d6f2d = pg.pgTable("cf_545a95c2bbb417d95e4d6f2d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0a6310c04d55a3a327b4b77d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c6003d4e761694a3629ff0e5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_546a663961b10d42ff09e963 = pg.pgTable("cf_546a663961b10d42ff09e963", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_adf3865c22d1b19d5030adc2").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f96d3ff3ddacf27254cb5c40",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_548d697ce53aa7102f91a75d = pg.pgTable("cf_548d697ce53aa7102f91a75d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_434426b972d2afe179d7b6a4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9b5a95b8892e888060c2e7c2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_549f82db70886f0702640598 = pg.pgTable("cf_549f82db70886f0702640598", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2ca3ce8d84ebd39d8649aaf6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_36f9b47a46a1559b239152ce",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5508d3da3ab6edffe4b1396d = pg.pgTable("cf_5508d3da3ab6edffe4b1396d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9702d63c46f22bbc1bd1b59e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3c25a5ed7e73b4a943e42da8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_55149c15a5475e568ed819b1 = pg.pgTable("cf_55149c15a5475e568ed819b1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a1dfa705235b8d4b91b44848").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_32e98dd11707929330b8f45e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5517cbfe760b7237dbabfc05 = pg.pgTable("cf_5517cbfe760b7237dbabfc05", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b168eefc30bb1c3d6124485c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9f5373d2c5be21f42e9ecfa2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_555dc714b3c3fc09c7b58d0d = pg.pgTable("cf_555dc714b3c3fc09c7b58d0d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ab13bcea55b6e10285a2ba81").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ca4f8b9b177f7ec1cb50308c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_55b3203843899a28644202a3 = pg.pgTable("cf_55b3203843899a28644202a3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_26a2fbb433024f1c41f9de34").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4171bb12a16733ef02d8b78d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_561c0e45ae0a72a2823ec9ec = pg.pgTable("cf_561c0e45ae0a72a2823ec9ec", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_92a23f8027cd0ff2c026a467").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a2fb2ecd48f1403edf969ff5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_56aff9244c7ceee8e2065dac = pg.pgTable("cf_56aff9244c7ceee8e2065dac", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f50dc15afe05bb9daa097efe").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c5bf23c122b18a11776ea4ec",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5740f07b2043449e056e147c = pg.pgTable("cf_5740f07b2043449e056e147c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_70f5ec249c653b40006a7968").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_842b7b838e4334356e4a40d2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_58094dd49062f96db42b3200 = pg.pgTable("cf_58094dd49062f96db42b3200", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a9d126aa1b87a88f0b25f394").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e0433760885a4d1a0dd6db56",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5830fdfdf6e2f6cb8e262be5 = pg.pgTable("cf_5830fdfdf6e2f6cb8e262be5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cb37c4dd9861351b52b5e5bb").on(t.revision_id,t.locale),
  pg.index("ix_2b2b67e6bacbba724fb47431").on(t.value,t.locale,t.revision_id),
  pg.foreignKey({name:"fk_fab78c85e344eacddf68a14d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_58766ce5c7a856cd9f1f6c81 = pg.pgTable("cf_58766ce5c7a856cd9f1f6c81", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.timestamp("value", { withTimezone: true })
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_18aabc58e6e6bb8aaf42e790").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8e26b2f612e75efc9480bd06",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_58d6a462cb0dd0c0708a32f9 = pg.pgTable("cf_58d6a462cb0dd0c0708a32f9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_09275fed39b96837d5756154").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2183a7dca4146189fd37a72b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_58e3812cd656b2284edc8acb = pg.pgTable("cf_58e3812cd656b2284edc8acb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a6795e5c65a59cb0187ef0cf").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fa586543b418637ad635801c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_58ef176879134b5654b36463 = pg.pgTable("cf_58ef176879134b5654b36463", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0c9ca8ba959c0cb60b486cd8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_48d1757d1d3a67d523f2881d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_597bd95927f514a2d4a9ec55 = pg.pgTable("cf_597bd95927f514a2d4a9ec55", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_012792a078e59858a1804c95").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c52cad994ef6d34cf42dda24",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_59876e8035c6cad34355133d = pg.pgTable("cf_59876e8035c6cad34355133d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_81f40bb33d3ea01f3b9a2979").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c41b4ea757ea3555ebb0b740",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_59f5d8300127bef31e1f499b = pg.pgTable("cf_59f5d8300127bef31e1f499b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9e973e73fcf10e6bbacf7bed").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8b60c98139c2b5d1a68df0ab",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_59f5ea199ade7f4bbf25ac4b = pg.pgTable("cf_59f5ea199ade7f4bbf25ac4b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7218954f1428b32c340776e9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6d50428a22133d31fb26dc3c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5a37cd63c04d4191a5292488 = pg.pgTable("cf_5a37cd63c04d4191a5292488", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_889ccf4266c18398068a84e7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_95cbcd5ac145c3c728660b21",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5a9f43fd8429743c25d85709 = pg.pgTable("cf_5a9f43fd8429743c25d85709", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4cb8e9a2c9b1aa84e6bad68f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2483696da93c5fbfda6db1f6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5ab3976cf030d55ff80d2c6f = pg.pgTable("cf_5ab3976cf030d55ff80d2c6f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2652f5a0d8229678ff19d879").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_eeae9caf332d003223cfd8d9",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_e982f92cfbabf03de53debe2",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_5ac769bfef9d2640b4eefb37 = pg.pgTable("cf_5ac769bfef9d2640b4eefb37", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8a76f1000296fb9c14ca5f1c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5a0eeb503bb3964810b67e1c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5c34ce748eeaf24865f6672b = pg.pgTable("cf_5c34ce748eeaf24865f6672b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_aef86e6c6e1e01beda884fcd").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_89876c6c21dc3daefe5eb3e1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5d57bdc9432ccb5a3d805e79 = pg.pgTable("cf_5d57bdc9432ccb5a3d805e79", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_dc323c832cc121f9bbf24324").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2a0d31a2e872167be9f964c0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5d6d682508458a4fa6e84fdd = pg.pgTable("cf_5d6d682508458a4fa6e84fdd", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4b97ce0f605b6da1e1f48ff6").on(t.revision_id,t.locale),
  pg.index("ix_5becbdedc40fcc4aed706a90").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_89546c4af6036b9b1f215567",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5d8191d4a07d7acb5cbd4b19 = pg.pgTable("cf_5d8191d4a07d7acb5cbd4b19", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e8aedf4fa27e88873d910a75").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cd30c8b981d236611ac2428f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5d9794e8c752ca3da1472172 = pg.pgTable("cf_5d9794e8c752ca3da1472172", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_895128f227faae5c4087d66a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_30cdecc1f46a69ba5daf6b8b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_b17969b9d7313fe360b97593",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_5de3bc725658e8ca8cab1725 = pg.pgTable("cf_5de3bc725658e8ca8cab1725", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_dfc2f29a369f7f2483cb2be4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_05a90fe1633257aaf4594d7b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5deeae3f6c82049e91e26e70 = pg.pgTable("cf_5deeae3f6c82049e91e26e70", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5429e34b6b7c3583f089433c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_52786f1f17585427aa216dbf",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_2b44b882438b657326288c72",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_5dfdcdd529e53729f2c1e05a = pg.pgTable("cf_5dfdcdd529e53729f2c1e05a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_85dfdbbac72f3ef390e8c76b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_73edaa7cc7b4465de098d931",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5e47c051c49cadf21e50e8f2 = pg.pgTable("cf_5e47c051c49cadf21e50e8f2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d4875b61f519472ac69e0e79").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1511954d6248036c16840fce",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5eac29fcac31f708a721049c = pg.pgTable("cf_5eac29fcac31f708a721049c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7c5d09d4b834f042e686c601").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a009d2244ba714b6dcaae07b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_5ecd870afdcb1696efbc041b = pg.pgTable("cf_5ecd870afdcb1696efbc041b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a634c5d213325eef41267fd0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_13d2126ce24a13909db01014",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6020fd81b0b906e38f0a7e01 = pg.pgTable("cf_6020fd81b0b906e38f0a7e01", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_64ddd62946190fb93c0856f6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fbc7a6f9d94bcc01652ebab7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_608cc9a4f6edbc028607fd17 = pg.pgTable("cf_608cc9a4f6edbc028607fd17", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4ac0f508a4b276004963cdff").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_122921280cf67b8d2121d72f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_60e716a332ec72d672f8ed8c = pg.pgTable("cf_60e716a332ec72d672f8ed8c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b333bd0f3b6aeff3acba01fe").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8f946360b82324192cfa3713",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_60fa4fc59ca671a8d59d41b9 = pg.pgTable("cf_60fa4fc59ca671a8d59d41b9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_73fc72e2eae56eab9f1521ee").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ea26822cce54ae3d6f5ac1f4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_61c5f2431ae9884179bbd92d = pg.pgTable("cf_61c5f2431ae9884179bbd92d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bbe924b23e828ab612f4e346").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7b41624e1ca44d4f6f516065",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_62072c862093216de56aec46 = pg.pgTable("cf_62072c862093216de56aec46", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_aa2cc9028bcf42f39477c16b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_228aab745aea942b2401fca0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_621ec4d25fbe611829c1a931 = pg.pgTable("cf_621ec4d25fbe611829c1a931", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1f037853b63f5d614da1eacb").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0d939c9240de83a2c84d7636",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_625be29f0ac2b7c97a1588b5 = pg.pgTable("cf_625be29f0ac2b7c97a1588b5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_36c3ff795d37610b02636f31").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_59bc794f4a48850277a655bc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_629d833355b59afa0301c3bb = pg.pgTable("cf_629d833355b59afa0301c3bb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7c1f6b13a4324baecd75212c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0b4d6d0e77c80202125d9b97",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_64b811e6590a94f6bfa4013c = pg.pgTable("cf_64b811e6590a94f6bfa4013c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3b62d83174ce8a91a16a6571").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f6cc66bbb34a297d11f3af4e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_64c08707a3df3dd5fb71ed64 = pg.pgTable("cf_64c08707a3df3dd5fb71ed64", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7a3dc0f9e9e2a1c51088d1fa").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_26fa9bf2a3f5302981aca71b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_652463b1f7c80ab536c13efc = pg.pgTable("cf_652463b1f7c80ab536c13efc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9bc7f4f92ec7e2867af742f8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8ac0d9296cbcf401cce65cb1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_8c184488277c36f8205ce86c",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_65e05c39f6648c9d821c7f2b = pg.pgTable("cf_65e05c39f6648c9d821c7f2b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c279b585f530eec3baf07ebe").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a78aba58365b8cba5a3b11d0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_66d6bd1bee05420c84dc7799 = pg.pgTable("cf_66d6bd1bee05420c84dc7799", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4853372de2ad355a06ae5797").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_015eb0f5dae6bd74a186f2c8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_676e9305a719546839f49ca8 = pg.pgTable("cf_676e9305a719546839f49ca8", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0c9311e2238625c93095fc35").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_188fff2e5fd547892edfcac9",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_679cef91c89473410d5d82b1 = pg.pgTable("cf_679cef91c89473410d5d82b1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3c931c715e0d3389b0e6afda").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3f3445a2682591c7393ad89b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6a12bb7ba20cf36db2857421 = pg.pgTable("cf_6a12bb7ba20cf36db2857421", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9a40b0014e6fc81231d0a6d1").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b6392f9d51961e414a6fdfd6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6a1e2f74fcdf81c24a5e7f23 = pg.pgTable("cf_6a1e2f74fcdf81c24a5e7f23", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1a2d1f1a7e15810417f7cccc").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5de932b02fa42259a5d3e8cc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6a8de71095750376e7b4c735 = pg.pgTable("cf_6a8de71095750376e7b4c735", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e6cf81f20407532d8a50aeb8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_50e6f03886ff69c8f0584274",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6a8f1fba16f4eb176dc90467 = pg.pgTable("cf_6a8f1fba16f4eb176dc90467", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_05c25b7364536d71a66002b0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f31076e4141d80958c1d33b0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6af2e9f23bc328c1c58f6900 = pg.pgTable("cf_6af2e9f23bc328c1c58f6900", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_371887847a025745330e268b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cb1d6208a53c5170e0be7282",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6c0e08671db9de63033b2605 = pg.pgTable("cf_6c0e08671db9de63033b2605", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cadedd2fa75b8ee3a7b26260").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a9c2a7b252e7da7d45639f24",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6c941f83d8019d827136dfbd = pg.pgTable("cf_6c941f83d8019d827136dfbd", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cfe011f60921f17479dc009a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_be111c648de20ef2b0b83521",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6cce336dba9c22d9a2a94adb = pg.pgTable("cf_6cce336dba9c22d9a2a94adb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_35a43ed2df6c50d3fc4dd0c0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e898afd8545340e5e0b8a253",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6d006d4ae795e608f64df38e = pg.pgTable("cf_6d006d4ae795e608f64df38e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e643d1a59d75502ec4db754e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_46e7b0383754d60c781ca130",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6deee90eaa9303c8cc1e0f9a = pg.pgTable("cf_6deee90eaa9303c8cc1e0f9a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_abe05cc61a1c4c13bf32162c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_831d4690129fdd94aee63990",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_6e4800b6305b186e0f9f7135 = pg.pgTable("cf_6e4800b6305b186e0f9f7135", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_27772f9806ce8a326322f817").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9c8c3103f44cc4822dc1ef6c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_70058ea66ee3db2ab1b8da5f = pg.pgTable("cf_70058ea66ee3db2ab1b8da5f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_db39520b454ec229041cd20f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2dc3c3a22dc9881f22a1acc7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_723ca7c6410bf4af7ec07567 = pg.pgTable("cf_723ca7c6410bf4af7ec07567", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_844c9b572805ffdf2d5280f6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_219120736efb69be655b5bea",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_72bb00fc30defa58ab01ffb2 = pg.pgTable("cf_72bb00fc30defa58ab01ffb2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ea999f9ac947861fbb082b39").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ea9d1d8ed8b5562783424bf4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7447008978204ab305d13f44 = pg.pgTable("cf_7447008978204ab305d13f44", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1a170ebdb4309a33c5c9fec2").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7b95845ac1d938ba34e21b31",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7482782f0b935f98c5405d67 = pg.pgTable("cf_7482782f0b935f98c5405d67", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0ec127552c886bac7d90a773").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_446ac995590c1292d68e0cbc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7549ae30047402dea589dd2d = pg.pgTable("cf_7549ae30047402dea589dd2d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c4393d52a4d647f84e52b126").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_05688a5a1abcd1234ff3031a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_c6e528df51cd417bf0f93eec",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_75558f4b6dad5e191679e42a = pg.pgTable("cf_75558f4b6dad5e191679e42a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4b29e4e747b51151bead7c3e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2407d177b95fe89abc55ee15",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7575854e8437f1aabee95a12 = pg.pgTable("cf_7575854e8437f1aabee95a12", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_eb2fa9b0eaed3cb01c3a87ea").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_693eade573ac80f6c92f192b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_75d54c282fef49739f45cb15 = pg.pgTable("cf_75d54c282fef49739f45cb15", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_377ddb571ed48adcc6dbc7a5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_989b9e51d1bb645f320b00b9",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_76010da95b54e22253bf339d = pg.pgTable("cf_76010da95b54e22253bf339d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2578b49d135022e95c831b42").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_be93f886359c4d7479d18561",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_761f35edeaedd7f976f05abc = pg.pgTable("cf_761f35edeaedd7f976f05abc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e8680e61c0e915be8f06258c").on(t.revision_id,t.locale),
  pg.index("ix_7beb73069459a04b1b690c89").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_a0bdd34bb17166499c6c43fb",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7690e017cfa61a9e114f4294 = pg.pgTable("cf_7690e017cfa61a9e114f4294", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_116fa013a18b06692caaca56").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d43b0d2ce50ce2e6ad9287a7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_76d6c9b513f13f37698328fa = pg.pgTable("cf_76d6c9b513f13f37698328fa", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_abf3766895edac3878a0e8be").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_47f609dbbb8e15fa3f657498",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7758f4bbe723bfda85d82fe8 = pg.pgTable("cf_7758f4bbe723bfda85d82fe8", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_481661d7abe4af86e59284fa").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9e85725f18889cc91fdec7dc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_77749fe9e70d4fa5b5c5c377 = pg.pgTable("cf_77749fe9e70d4fa5b5c5c377", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_6b60042849ef8ee3e68c10eb").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_259e32285f2d0610f5eee05c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_77bd4bdae5bb5bd4bd8c9f64 = pg.pgTable("cf_77bd4bdae5bb5bd4bd8c9f64", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d9157486e4326baef051c203").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_971a464fbb7e809e8da693f0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7817529c281c07ed7f8026db = pg.pgTable("cf_7817529c281c07ed7f8026db", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_56fe4cb162afd5f2fe56d09c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d12dee94ac367bdd20acbdf4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_78c4897a668f5b76191e4e05 = pg.pgTable("cf_78c4897a668f5b76191e4e05", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_60cba4616c88972f232a1874").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5ce8d68b85d057a1cf50d026",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_79a6a941985e24a4a1330a4b = pg.pgTable("cf_79a6a941985e24a4a1330a4b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e2595060ebd3fc95b7070204").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9a0d9f5f8c8cb56b87f17f6a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_79a99200f05c0db1fda67675 = pg.pgTable("cf_79a99200f05c0db1fda67675", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ec6c9af62ad61b05b9b847f5").on(t.revision_id,t.locale),
  pg.index("ix_cbb49377c042a475ab464254").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_65dbf97d0be0cb15efd31d21",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7a4f7526dcf4ed7720ba8757 = pg.pgTable("cf_7a4f7526dcf4ed7720ba8757", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8eb75a9aa290c7508d32c3dd").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2a1e1574f374dfa99174f221",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7b33fb4eb5336a34abeade6d = pg.pgTable("cf_7b33fb4eb5336a34abeade6d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_fc141cd5824df211938da1c1").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fa57bc0360f647f8cf1ab271",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7c83d76254f75d38fd5b45d3 = pg.pgTable("cf_7c83d76254f75d38fd5b45d3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_233e725ce807290929502374").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ef9bddd3e4d74d58502b7db9",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7d4c55122e3ce6e49501347b = pg.pgTable("cf_7d4c55122e3ce6e49501347b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_23df3f8e18674a709a623c7b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_57b85335b61e097732939ae6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7ef59f92342c800a848ee52b = pg.pgTable("cf_7ef59f92342c800a848ee52b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_45130a46f75954cb5c75b5e2").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1b30d944739c7172a6caa2e6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7f23e1826db46bf49f5b9829 = pg.pgTable("cf_7f23e1826db46bf49f5b9829", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_72b5106d6947cc276dd780ce").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ad611eb304349bd23ea08c7d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7f8ece3585e3668450608f61 = pg.pgTable("cf_7f8ece3585e3668450608f61", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c0ca1712e380f07029c90d1d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0d45af2170159a24629638c8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7fd10147915357b1aefa3634 = pg.pgTable("cf_7fd10147915357b1aefa3634", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_de3db4c4ed86b5401339d88a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f9d2608cf2b02b76b266fe07",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_7fdb0a12c9a8d9cc02d7135e = pg.pgTable("cf_7fdb0a12c9a8d9cc02d7135e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_731a96d98df20bf47540d8c5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7fed420b776c2e35354cc2ea",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8048e198221ac50b7c4d4727 = pg.pgTable("cf_8048e198221ac50b7c4d4727", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c1093491d3c1be2044ae29fa").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_dc2e9ae83f721c1fd4c206c8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_80bafad94f0b317f5d9c9211 = pg.pgTable("cf_80bafad94f0b317f5d9c9211", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e2f7581a52bcbc6a3f4feec8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d77b12d83cda7ad3c9ddbb1c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_815add62f012d8d87555f5dc = pg.pgTable("cf_815add62f012d8d87555f5dc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d7399de3e6eff392ffadb018").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a6da487aa3a1a86245ab2dee",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_81a11416a9b47ae4a412a5f9 = pg.pgTable("cf_81a11416a9b47ae4a412a5f9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a4c9bc27dadcc76d0fef3eab").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cfb1c5cfe1cdda381aeb2508",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_81bda96c8cc38b0f7731f98b = pg.pgTable("cf_81bda96c8cc38b0f7731f98b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_62caa4d9b9e949b37ca97c15").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_488616d55698cb4bbefbd4cc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_825d2bd839bb8028d05f6a00 = pg.pgTable("cf_825d2bd839bb8028d05f6a00", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d27040ff0c3fc0c5e1217407").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6f1901159fcb3c500f54ad84",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8316e1c461d92723a607a85c = pg.pgTable("cf_8316e1c461d92723a607a85c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d7a0a69f936057ac7550a0f6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_63befa322617e4b877f2d102",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_823e5abd9370d637068fd2c8",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_84500cb5f28c8745cff08dc4 = pg.pgTable("cf_84500cb5f28c8745cff08dc4", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9648038e1a55a387e035afd2").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8f0794e90458959ae1b54797",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_849557e29e3c60a2e90f5b13 = pg.pgTable("cf_849557e29e3c60a2e90f5b13", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_918fa278814d3a9bef4eeb38").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4c3ca8ff25a552816f67d097",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_851b17b5e20210bb12646f4d = pg.pgTable("cf_851b17b5e20210bb12646f4d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b888d44cc3bb510336efabe3").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f09be2497df609ef695badf7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_85717be9211dee683f3938ed = pg.pgTable("cf_85717be9211dee683f3938ed", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_93c92e07ac24f85776591758").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2f6620e39fd08f2395522a4c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_85aad0979fce790db2fbd543 = pg.pgTable("cf_85aad0979fce790db2fbd543", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ff40975d8736b152a68802e7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_289d6009c0d344279d09ecbb",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_86997dedd3ce2c4cbc069892 = pg.pgTable("cf_86997dedd3ce2c4cbc069892", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_237281e99e5bac17754433ad").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_eca1229f2a72584cb1ae8bdc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_86a1347b504fc416270f851e = pg.pgTable("cf_86a1347b504fc416270f851e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cf764c3d716bdb201b061870").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9fe7d6f667b24451dfed34f1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_86cc66152e73a87446721a33 = pg.pgTable("cf_86cc66152e73a87446721a33", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_df2f4d11a5635004ccdcb413").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_bc41ae008f3f9d55ab0b5423",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_874abc0f1082ae3656dc5859 = pg.pgTable("cf_874abc0f1082ae3656dc5859", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_80c83b3cab3cdaa4fd2f3943").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6285bd3e9d8d4d3880f50e9c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_874dd13f0dcbf4bee77e4a8c = pg.pgTable("cf_874dd13f0dcbf4bee77e4a8c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d6f3e653811fbd37f7898526").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6a68d95053cb498d81c9e1de",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8776a641937bc475eb47d551 = pg.pgTable("cf_8776a641937bc475eb47d551", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cef55655e9ddcc89c497691b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f967d6376366d2991ecc1e86",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_87a648193aa7a01031f0fd7b = pg.pgTable("cf_87a648193aa7a01031f0fd7b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b5b2551911baa476a82a4cb7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ce5795fe97121a79d7e475a7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_8828bb2a137e0100aa46e7c4 = pg.pgTable("cf_8828bb2a137e0100aa46e7c4", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f8b6493a4694453445691e55").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_33fb09a542de0c7554db3851",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_888b5194e3b9f149e19da499 = pg.pgTable("cf_888b5194e3b9f149e19da499", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_de74a78163f242a65e2cad6c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_211e3d82a494754713a98710",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_889938dde8ed26a28aec44f6 = pg.pgTable("cf_889938dde8ed26a28aec44f6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1464734566bb3f4de08ab5e5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_82ebbae5dff73c3a376f49ab",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8965d6756f03633aafe0f55a = pg.pgTable("cf_8965d6756f03633aafe0f55a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_02089099dd4f7c340bbee608").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_210e9b4672a481b9b497d64b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_89b4707290853535c24b7bef = pg.pgTable("cf_89b4707290853535c24b7bef", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ad2a8882ab09f7d941a07718").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c04761746b4c3c6626a7fa84",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_89b5e83ad0746d60085a6eab = pg.pgTable("cf_89b5e83ad0746d60085a6eab", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2fc59d361c9d8d21603368ca").on(t.revision_id,t.locale),
  pg.index("ix_4f3ca1cf2548066527bcf2d2").on(t.value,t.locale,t.revision_id),
  pg.foreignKey({name:"fk_d6a7df383f143f2357369606",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8a3ff99de25bbf8dc459c958 = pg.pgTable("cf_8a3ff99de25bbf8dc459c958", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c34eaf94685b703deb3b07a3").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_989ec8c8a55c98229cc1a1e4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8a8d58bf29670cd7c87d9b4a = pg.pgTable("cf_8a8d58bf29670cd7c87d9b4a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4683b06366516c9e0f2c0d02").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5bb07036f389477fee74b768",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8b4a3e843ed23595e0a0df3f = pg.pgTable("cf_8b4a3e843ed23595e0a0df3f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4779ee0583e14f8720b47d6a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9187c693039a55964b055da0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8bfa27c1b598b742babedebe = pg.pgTable("cf_8bfa27c1b598b742babedebe", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bd2a3980d40571b7ebfa3034").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_42ea1ed819906bb48da75b22",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8c55315cc59263f9962b1775 = pg.pgTable("cf_8c55315cc59263f9962b1775", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_29056a0397bca774727990c7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cc68d19af723d6e8b00df114",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8c5e25b0ce65acffee1ea80c = pg.pgTable("cf_8c5e25b0ce65acffee1ea80c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e9b4dbdb7347f47d1e3bd0ef").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ce83b098e7f848a1e23a0cc7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_8d58ea6afb761fd4c254aab9 = pg.pgTable("cf_8d58ea6afb761fd4c254aab9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0cf1e322ee13c3f09c1c865d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a8ccd16d9aa258638a23ab2e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8e49ad5bb92ef10f92de2d37 = pg.pgTable("cf_8e49ad5bb92ef10f92de2d37", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f72b4c3e6ae65bb4897be707").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e073e387e107b9a1a9ef554c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8f3c8fc44c8d11fa4da90872 = pg.pgTable("cf_8f3c8fc44c8d11fa4da90872", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f43180b7587779372d7b2e92").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fc060ab74a2bbbfe9f6afbf1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8fca1745d718bf69a312cdfb = pg.pgTable("cf_8fca1745d718bf69a312cdfb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_488fd06324514a33820189ea").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_869c8b845f221b08bd065447",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_8fef229341ac1bf497990d13 = pg.pgTable("cf_8fef229341ac1bf497990d13", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c29dd1ad85f0618ff9eba177").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4c3604a9f37e16865cc5bc9d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_90380ace66bcff014e139dd3 = pg.pgTable("cf_90380ace66bcff014e139dd3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bbb69da033a890223b37c545").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_411319eb75d078f5db842c70",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_906f77c12f9a0f7c5a8d58ca = pg.pgTable("cf_906f77c12f9a0f7c5a8d58ca", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_44de763ccc2590eeabd6599b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_511483d18af8f5a68ff9057a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_913257db3451a9ac7621f48a = pg.pgTable("cf_913257db3451a9ac7621f48a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_397c1ebcc040d51836f30514").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_784fd292e4e0f920c1a7a0f2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_91c03b733a23918846588a2f = pg.pgTable("cf_91c03b733a23918846588a2f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_659c74746694192150610530").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_bd06e7fbe13f102d39361800",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9281d88e7fc0efac24cd0439 = pg.pgTable("cf_9281d88e7fc0efac24cd0439", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9f9e7d651281426e50b39736").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6fd55ce089da4f438143b38e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_92829a69776ad52790993a61 = pg.pgTable("cf_92829a69776ad52790993a61", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f43bee6f1494c321158e6d1d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e98862cc8f025a12d8ea86e8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_929e4cf21f97996fed484788 = pg.pgTable("cf_929e4cf21f97996fed484788", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b06378adf6c9b9cbb2413f72").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6ec25d85cadf26f74c14ce86",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_92a1d63bc508c7703084d687 = pg.pgTable("cf_92a1d63bc508c7703084d687", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8464049644d97eb8a717c14c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_54f8e184e97d4ab26066383f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_92dfcdccc3e80b46aa13818d = pg.pgTable("cf_92dfcdccc3e80b46aa13818d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cdf66be73652ce510a76d8b6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_dbfe1e133071d13fbb72499f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_938520f4a8d983ddc1b9c23a = pg.pgTable("cf_938520f4a8d983ddc1b9c23a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_28110c1062704375255c5a20").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5d8259cc891704d847b66245",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_93eb792864d7072c7c7b5f4b = pg.pgTable("cf_93eb792864d7072c7c7b5f4b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_88979d889bdc2648d6de93a5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_110b2ecbb5293ff5354068ea",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_941141f804cd0bd5725e831b = pg.pgTable("cf_941141f804cd0bd5725e831b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_58d779511ea5bd2c1c8ff098").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_395e54a6cc2eb61c47365012",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_949eb9b813c3df46605b0773 = pg.pgTable("cf_949eb9b813c3df46605b0773", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1cf0ff6585f3e827c47f93ba").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ac8d2c4063099e4aef74aacd",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_958c57ca877c479ca1f596ae = pg.pgTable("cf_958c57ca877c479ca1f596ae", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d645d583c78a8229e173b781").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8c909c8ae31ce27f94fbc33c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_967ee5e052e4f0bfebeacd45 = pg.pgTable("cf_967ee5e052e4f0bfebeacd45", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_fdaaa0d9580906a57d0439b6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_021826c089a4b1ce9d001a09",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_96c58b9ffc710fb6cd4781c5 = pg.pgTable("cf_96c58b9ffc710fb6cd4781c5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_17bf351249fee7d3ecee1533").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ee150ca4f11b983d6c4cd26e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_96f91d79d216efce46187daa = pg.pgTable("cf_96f91d79d216efce46187daa", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ad8972f86f32c850eb2013b9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_37de9c8a2f3bbd7145908d5a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_96fdf03bb528fa5bec0978ef = pg.pgTable("cf_96fdf03bb528fa5bec0978ef", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8facdd39ffcde5cfff8176c6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b6773ba61870addc065f69fb",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_97142d43bb312a19e7d9a2cf = pg.pgTable("cf_97142d43bb312a19e7d9a2cf", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0118d9096542116a83a9200a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_35cb16632bc8223be057cd6f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_97a33d2330b43aa33f0becdc = pg.pgTable("cf_97a33d2330b43aa33f0becdc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_be7df890ab0d81a08eef47d7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d9863820f1c74f72a41b6c40",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_98432137ef25c6a50313fde5 = pg.pgTable("cf_98432137ef25c6a50313fde5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1fdb53fd985f31ba95870556").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0b5fbdfe143d99e15ba69a08",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9875a9629ff521082e8f3591 = pg.pgTable("cf_9875a9629ff521082e8f3591", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_958eb06047c75838da332394").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ad69b183a7b7b04aebdd4d71",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_98c1971e9f287e7ff1256b9c = pg.pgTable("cf_98c1971e9f287e7ff1256b9c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9a7937515e40e4206bd59910").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b7924b6af30ad17230c1fdba",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_98ee6ecb7bb30f9dadbad182 = pg.pgTable("cf_98ee6ecb7bb30f9dadbad182", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_fc9ec15c88eb7862d7cf2976").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_675c3aae259858ce17815fb3",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9960ac1cb27aeb689110ee34 = pg.pgTable("cf_9960ac1cb27aeb689110ee34", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_dcd023618caa2452b67f07b3").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fd37ca27830dade2f2eac334",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9969bc9e2fbe11ed840cba38 = pg.pgTable("cf_9969bc9e2fbe11ed840cba38", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_07726e6e5c97fcf7a57d74b6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ab7368de5deb5275708f5a71",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_998ee292dbe95a0841a10e0a = pg.pgTable("cf_998ee292dbe95a0841a10e0a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3cc0513d4a12936777fd3e3f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_dda9e5d16cd3066f814591c5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9a5455cf79b6f8172f87cf5c = pg.pgTable("cf_9a5455cf79b6f8172f87cf5c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ba8c2d01c3c3ab9e6026707b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_bb31df153fd9e740812232ed",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9a5474c208e306b8f729630c = pg.pgTable("cf_9a5474c208e306b8f729630c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3f9dd32bc911826286e4295e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3a66e96fbfc8d77388a22fd4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9ad6e9e99320994ece0b40a9 = pg.pgTable("cf_9ad6e9e99320994ece0b40a9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_90d162a5b62e89687574c25d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4bde13321dec5465416302c7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_9b2060e0a6d045a7e0618ff3 = pg.pgTable("cf_9b2060e0a6d045a7e0618ff3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_267b355b877f7ab45169d2ee").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ec356c690f95f106cbfcd772",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9c8a3723556d72ba7d8e5566 = pg.pgTable("cf_9c8a3723556d72ba7d8e5566", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_598aff662f3a5054b9085eb7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4cda66a3da4232d28e51c77a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9cd092b8df8f161d26983865 = pg.pgTable("cf_9cd092b8df8f161d26983865", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_90e8075bb6c97101a77e4d49").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9ec465a02d295fcaa01127f5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_123425991f2d1b76ed5943b5",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_9d070e2b2b22d6f44fdc7b99 = pg.pgTable("cf_9d070e2b2b22d6f44fdc7b99", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a5ebe0628253593853bff51c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_87465646246517d03bb346ff",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9d8474135207b327c100d116 = pg.pgTable("cf_9d8474135207b327c100d116", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_effdaf774df364f336875af9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_bd941abbed8feabe822a56ad",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9d9e61f21ba4380be8c8ea88 = pg.pgTable("cf_9d9e61f21ba4380be8c8ea88", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2a8f492a4dad3cc8d5207ec5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5fac06ff7d79abe4260c3881",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9df763b4ab32fcd12da7d5f8 = pg.pgTable("cf_9df763b4ab32fcd12da7d5f8", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5dcc45e7ffae752ee00de0b3").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7b3f08c52f6c171bf0205af0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9dfc89b2dfd4b8ef1cf5a942 = pg.pgTable("cf_9dfc89b2dfd4b8ef1cf5a942", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_89d846c68b2d814980a7ece5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_35598851409a8fd3ceadce77",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9e78a0fece465f591defb6d5 = pg.pgTable("cf_9e78a0fece465f591defb6d5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2eac6836ef227d550520c3cc").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_34892c940015c8caef4584f5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9ea52c9068333d1f84c67e23 = pg.pgTable("cf_9ea52c9068333d1f84c67e23", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_225e8ba6ae3c63f79ad41bbd").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_22bdf214ad2e6dcdf66ebc83",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9fccd8f79760f6ed773514dd = pg.pgTable("cf_9fccd8f79760f6ed773514dd", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_04056212f713f695559157e0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_20cf6b1aae4e7ecc131020c8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_9ff505954757fe126de03d4b = pg.pgTable("cf_9ff505954757fe126de03d4b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f66892873e62ee073db76739").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_74086c247549fda5197bdfd3",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a0b1c4c19435c7b7d245dd9e = pg.pgTable("cf_a0b1c4c19435c7b7d245dd9e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c2db9777934a487bf37172ee").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d47d38ab1a2b97dcbca2acd1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a2b04ecd11caf98249029a46 = pg.pgTable("cf_a2b04ecd11caf98249029a46", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3c6cb1ca72132db58dda56fe").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cea30b94d30e41008be71dda",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a2c0c13ff4b0b64dd8166c56 = pg.pgTable("cf_a2c0c13ff4b0b64dd8166c56", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9735f3d94e09623d91bb52e0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_72d9b60f662aa7cb34a5309e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a3a85157c5875e45c67dd386 = pg.pgTable("cf_a3a85157c5875e45c67dd386", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1d0af7b16bade759fe915f49").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_33c1fe75dafdd0c8d67f3b40",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a3d19bae6aaf602b2783444f = pg.pgTable("cf_a3d19bae6aaf602b2783444f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d436b6cf714153a3eb0dd14d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_21b62b0d20e186c72c5b24c8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a4d2040ccc4d2267223ee6d1 = pg.pgTable("cf_a4d2040ccc4d2267223ee6d1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3336297767531b22e3fd5978").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a32a07fcf66a9fd4c5018a4c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a4d48adffc1744d7ddd859d5 = pg.pgTable("cf_a4d48adffc1744d7ddd859d5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0b9df05c39e500803178a52e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_13d29c42ebd447e02c1dc2c0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a4e8e1b58c079b6d295a0b44 = pg.pgTable("cf_a4e8e1b58c079b6d295a0b44", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ced39c2d4893a86f22e9189f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_81e0a54e3f75dd3a221e8470",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a4ef4c05bfe0659745ee0229 = pg.pgTable("cf_a4ef4c05bfe0659745ee0229", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7a1e2effa5fb461990eb486e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cb85c8d95eaff592c11564b5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a54daa2d3b520001a3cbb2cb = pg.pgTable("cf_a54daa2d3b520001a3cbb2cb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3a6684a3fc3bace9039f24b8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d7150a2099c4bc1a5028b10f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a6f67237dd53303d228f401d = pg.pgTable("cf_a6f67237dd53303d228f401d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_46a184ec77a183dedcfd73e5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_48fc2f6aab559fc718d6e73b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a70a075c854a2199069dcfcb = pg.pgTable("cf_a70a075c854a2199069dcfcb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_07e35647564b4b5fd2bd4598").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a57a077d0eb35f6a02b26f46",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a8437cd1fece6c1ae770ecc2 = pg.pgTable("cf_a8437cd1fece6c1ae770ecc2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a4bdad17b7e594cab3654589").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a9d0426d55c661fa480df24c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_a9157dee9eb5baf3cb0ec259 = pg.pgTable("cf_a9157dee9eb5baf3cb0ec259", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d84fc115c7737b16117a4cdb").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_af3a309aac8891aa2aa3bf6a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_aafcbccf6f48db893f8bfb9c = pg.pgTable("cf_aafcbccf6f48db893f8bfb9c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_27bd66a19dc575a3fb19785a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e2f2ee0cc9949c786750011d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ab5294672999b899d9dd79c2 = pg.pgTable("cf_ab5294672999b899d9dd79c2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bc789de8e4b6f0a530ba6ec9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_40ff046bfd3d8a38afe00331",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_abeaf6f5cf406be0c5ea86c9 = pg.pgTable("cf_abeaf6f5cf406be0c5ea86c9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_85a3343ca98de9916864b888").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1a13203d1a637965d7c865b3",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ac35c22cb5d278ec2ea5e2bd = pg.pgTable("cf_ac35c22cb5d278ec2ea5e2bd", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_804badad0bd7c25d8ff0c6a8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a81c1cee1023438182326739",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ac9cda88954c0f01f1fe394e = pg.pgTable("cf_ac9cda88954c0f01f1fe394e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ffcc0d30e0bf08c9f29c32e4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b364d952cbb11652ccc4eb0c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_cc5843cb3e8b3a1beb8e719a",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_ad2f75aa04964314b796002c = pg.pgTable("cf_ad2f75aa04964314b796002c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_87637c30b52d0078e385640f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6526211317871b83e03028b8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_adc8fec0e0f183e2050ea7c3 = pg.pgTable("cf_adc8fec0e0f183e2050ea7c3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a4fc1f57fb0ef3fd630ddad6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d5056bdb7c51bc1a66c791dd",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_af2cfcf2527dd10503bad43c = pg.pgTable("cf_af2cfcf2527dd10503bad43c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0b361f53190cce50e6ad4e03").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f93628c5770bf46531c0a998",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b0412a702456c2d81e7db7f9 = pg.pgTable("cf_b0412a702456c2d81e7db7f9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3229fd98eb756b2abc339b36").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f6a9defecdd0f4105309c107",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b048c65964a9f9c2d8e5102e = pg.pgTable("cf_b048c65964a9f9c2d8e5102e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1b855a1a109303c54fb3d84e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0a2b1654b6a44fb4676b3e70",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b04fd65ea3adc0db548d6f00 = pg.pgTable("cf_b04fd65ea3adc0db548d6f00", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7b2fcad2368555fd51f0db28").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9ce8c539785c56996d3db936",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b091cdb2a7315fbd00f1ab37 = pg.pgTable("cf_b091cdb2a7315fbd00f1ab37", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c594038c7cd742b04d8465cd").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7a707e2d1c98154422b67fad",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b0bd570a9d6cbe91285e404c = pg.pgTable("cf_b0bd570a9d6cbe91285e404c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_de8e5bf9da46598a728af3db").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3fcc5c0b676bc0a6a8f57903",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b134367476d0bd2382c0ac11 = pg.pgTable("cf_b134367476d0bd2382c0ac11", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_29c9973b58d403bb4c5f3a1b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_26f9ed6a68119170c99b75f3",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b5b54efa7becc947afeed61c = pg.pgTable("cf_b5b54efa7becc947afeed61c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0c28c15d3fcf51fb9fcde1b6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_40ac5ae9c38002230842fbfe",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b6eed262f569483eeb7aa5bc = pg.pgTable("cf_b6eed262f569483eeb7aa5bc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cdf91e1d2bfaa14d1a3f4994").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5065961be69bef87d8af454c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b8320f1859970ca10ee3289e = pg.pgTable("cf_b8320f1859970ca10ee3289e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b8b505cb6b2d365b84df77a5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fce29c4adf6c722f708c83da",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b89e9eb816ce433d003012a3 = pg.pgTable("cf_b89e9eb816ce433d003012a3", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d8abac545b0385a9cae8b4ee").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e7c19988e57ce73b4e5eeea8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b928f8f2092ea23eec6bfdbb = pg.pgTable("cf_b928f8f2092ea23eec6bfdbb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_eee55b85226ca9bae5c3237f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_602070deb409d42647bc9403",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b938e2c42b620740573a4552 = pg.pgTable("cf_b938e2c42b620740573a4552", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8a2581e4ec87e9839e629106").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c6f0382a73bd25409e0cf178",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b955a89ac44e12e8694d80da = pg.pgTable("cf_b955a89ac44e12e8694d80da", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e87f44829f45ee1eba3a7857").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1e88e864c1c11db56c00c266",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b971a8059842c2c1c3509540 = pg.pgTable("cf_b971a8059842c2c1c3509540", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_44d4c72c58378c11b1ec47fb").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9694432360d283a9c893e89e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_b9a3663d219c4e5a3b1ddbca = pg.pgTable("cf_b9a3663d219c4e5a3b1ddbca", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_028f952a9535a43c39f8345f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_603677674aa8eec4874836c6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_bb6da7934470c8df634c6fba = pg.pgTable("cf_bb6da7934470c8df634c6fba", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9b12654303da70b08c3dfd12").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d4241d0841cf5ee30845bb67",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_c148fc404bc3ae47433a9b15",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_bb7df60063c3a0a21f46fb5a = pg.pgTable("cf_bb7df60063c3a0a21f46fb5a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4d79dd8633c6bdedf388d2e3").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_da05c0c0ba4555445a9e7c96",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_bbfe540c4b32730036548bb1 = pg.pgTable("cf_bbfe540c4b32730036548bb1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4cb0e59003cbe29af37c55c4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f5cd5ed841a3729e0812317b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_bc7777836762011dfa7bebfc = pg.pgTable("cf_bc7777836762011dfa7bebfc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2ab12984c90be365eb0a64ea").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7571fa16362ed57b34906401",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_bcb5417ed0c99e8c593edc94 = pg.pgTable("cf_bcb5417ed0c99e8c593edc94", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_08ffb598def65fb12fbb2c91").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8a560eb104274c6c86a705d8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c01ea48e0f03c0240808aafc = pg.pgTable("cf_c01ea48e0f03c0240808aafc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_01c7428639dcf7ed49fec921").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5d1ebcf3bcd64e3ab6cd8658",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c0fa13010cfb334ee642a775 = pg.pgTable("cf_c0fa13010cfb334ee642a775", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_339de18beb63b64bb1815ad0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1b09eabc953994599dfa6c3f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c2220244dc82a95b0571e8e2 = pg.pgTable("cf_c2220244dc82a95b0571e8e2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8300626c28a77ddd7c0720bf").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_63ff77c8eef0e227f544ee51",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c2f8635c7d06764fdd105758 = pg.pgTable("cf_c2f8635c7d06764fdd105758", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5700688641bfd59ba03c9b51").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_226d729db028c4537f3d400f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c3e6cf00970675e3f9e0f938 = pg.pgTable("cf_c3e6cf00970675e3f9e0f938", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_99b536116aa59a5631278774").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_aff88c26df54f3d3f6fc619f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_5c6a0d53170ff6bde86908f8",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

export const table_cf_c42b002c57ee1eaa702cf264 = pg.pgTable("cf_c42b002c57ee1eaa702cf264", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_56c53d347d168680e6145942").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_53d79963581cc69b3337ac2d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c4986caf85d95bf3658c7a0b = pg.pgTable("cf_c4986caf85d95bf3658c7a0b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_881cd90d282a355999ba56df").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d2c3e72c88c9e787286dcd89",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c4bd62068157597da5d84457 = pg.pgTable("cf_c4bd62068157597da5d84457", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5b6cac50f0616cb6aaeb7345").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_662cc13712663c1adad41e7f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c62155a4d0186218eb446dda = pg.pgTable("cf_c62155a4d0186218eb446dda", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b963c1930ae68518cbfa1285").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c2474c0beb86a007f0de4cd5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c6246b4257ea889f04c52b24 = pg.pgTable("cf_c6246b4257ea889f04c52b24", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_04d69b03501e96e8635172ba").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fa901fa0004c6d4f74c28cee",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c6d23e816fb22b5bae5d6984 = pg.pgTable("cf_c6d23e816fb22b5bae5d6984", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8bf8b14ab0b176288a74d3ac").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cb725946eaba22490cf04773",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c7a21b86881cc4bee63f6cd7 = pg.pgTable("cf_c7a21b86881cc4bee63f6cd7", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_909055bf37fba75cad41f83a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6875e545128e36ce3229b6e4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c811037465e5c32fc99047bb = pg.pgTable("cf_c811037465e5c32fc99047bb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b441fc31de5e834c38ffbbd7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ceb39111059b0aa3123dbd19",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c83be34e05b29133c012f4dc = pg.pgTable("cf_c83be34e05b29133c012f4dc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3c187d4b5a769cf503c13d0b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3cfbd67e0c11e607dbdf411d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c85ce1a5bc3449109b68a2bf = pg.pgTable("cf_c85ce1a5bc3449109b68a2bf", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cdca3ea474e290c238d51f08").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1078716e0e2906b8fb1d662c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c888b90025ed123d6f3ce155 = pg.pgTable("cf_c888b90025ed123d6f3ce155", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_faf3b42f82ecd4388b1975c1").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_16992381bac297ca7f6e92f5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c88c13277a8e496bd8f42426 = pg.pgTable("cf_c88c13277a8e496bd8f42426", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5b01ab1b5e53ca3d5668dc50").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e5c48c5560095d285bb0b68e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c968328cd9eb837879022b81 = pg.pgTable("cf_c968328cd9eb837879022b81", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e6e9e4a93f4bb007b01dcd12").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d875c0ce97ec11573a3df667",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_c9d1f918fec2c144d641c93d = pg.pgTable("cf_c9d1f918fec2c144d641c93d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_760c02bb4afb7ffdb00e93f7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5566103aadde5defe2ede827",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ca1fba197e3eda7cb86450b0 = pg.pgTable("cf_ca1fba197e3eda7cb86450b0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b3804c54bb136cddf586b03e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f32567c0ae02ac3214caeec4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ca40ae9ea713307f4c7b4604 = pg.pgTable("cf_ca40ae9ea713307f4c7b4604", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3e65dda02c8ce1a4e38364bf").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_da23777c67a8e75e0a7bcfc4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_cb2f872e0ca6310d7b6e6fa2 = pg.pgTable("cf_cb2f872e0ca6310d7b6e6fa2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_86d18da34ec956b4066725b9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f892e6be2c48221357b85dcc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_cc12139fa72dc136efc70af6 = pg.pgTable("cf_cc12139fa72dc136efc70af6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ceb70e87872cf9a631745e22").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8499f8752dab1968614339cf",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_cd413b47f4f216f24ba6c380 = pg.pgTable("cf_cd413b47f4f216f24ba6c380", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_65e1a25ad0c5c90731b881b9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_983657403cf5fa14d7499e54",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ce051ddf37e7df53914081dd = pg.pgTable("cf_ce051ddf37e7df53914081dd", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_60cf4dd717505362d9a0021e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_def7b4833940e5efc43d6f4d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ce5a0226b3bea34c9408286e = pg.pgTable("cf_ce5a0226b3bea34c9408286e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c95ae280620f90024722e84b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_834e160e4e7e7d8255dc2cd4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ce8b575953c93027c3a8a26e = pg.pgTable("cf_ce8b575953c93027c3a8a26e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d9b8cdad67e52f40244ae599").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e1ca51e0c8795876fcda047d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_cea69e849b3fb0d7e6bd46eb = pg.pgTable("cf_cea69e849b3fb0d7e6bd46eb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8c834180fe31cc1d052d8d2b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f2810c7fc65afbb761a04746",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_cf0a0594b71077c0bb5230aa = pg.pgTable("cf_cf0a0594b71077c0bb5230aa", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ebd8cb70cf28936906179263").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4f4f88a1ce1d238e49ce754d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_cf52ca39c9868f5285ea6be2 = pg.pgTable("cf_cf52ca39c9868f5285ea6be2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0f0476f6274b57749c9a88de").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_41b3ce6cebf7b7befc425228",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_d02f070e8a6cda96205f8cc0 = pg.pgTable("cf_d02f070e8a6cda96205f8cc0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_109b21450e50c37890f5321b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_768cf8a1177e575fa125dec5",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d078630daa805450c1042f8f = pg.pgTable("cf_d078630daa805450c1042f8f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_eca564333f551dc8f3f017e6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_474410f19e5c102e9c5bc4f2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d07bc4d2754ca3be5da81571 = pg.pgTable("cf_d07bc4d2754ca3be5da81571", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_08a86a8efc80f4e5c6396733").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c745262e3c6787c3e54bdfb7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d13e7400f0cf2e8ff90f61b4 = pg.pgTable("cf_d13e7400f0cf2e8ff90f61b4", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f27bee93d750684d982e0577").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_717bd2c51b7903d90b17909d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d1e96a827aa19cd31f6b5b9a = pg.pgTable("cf_d1e96a827aa19cd31f6b5b9a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bbbbd563ce7c81bf9687cd7b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c13a2f71a99118db023e60e8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d3d1a9443914e0098c77614f = pg.pgTable("cf_d3d1a9443914e0098c77614f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bddb342fe20e3f099597ca1a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cadc549e68d067f9cf3a5699",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d40fd6e7ebe77262ec9ab9fa = pg.pgTable("cf_d40fd6e7ebe77262ec9ab9fa", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cfc54b7aedb59d7cff4bab00").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a65b6856a696e4738eee2041",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d482d832fab169771f413d57 = pg.pgTable("cf_d482d832fab169771f413d57", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_fbd14d9f32fb00593853a568").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_976c3927f71a71c3f3479a85",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d4a67c4d3ad970bf07c591b7 = pg.pgTable("cf_d4a67c4d3ad970bf07c591b7", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_18e70ae110610c5951db05a0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8c4a9d69e4da97edfa5e1ed6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d4abaee3a57fde37af0b1fb0 = pg.pgTable("cf_d4abaee3a57fde37af0b1fb0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b8e363e9aa12b95e0a2ec133").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cc749402c2df11cf638b9ca3",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d4e3ae8c01b32e1fe0b0db89 = pg.pgTable("cf_d4e3ae8c01b32e1fe0b0db89", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_22db428e5d96a0d0eb97f60f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a80630a7f8a23fa19a253dbb",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d596322d384c4cc028f66eab = pg.pgTable("cf_d596322d384c4cc028f66eab", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cc64769e3ea21acf0f9a96e5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_d04d749ad29ae34cf0fd4141",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d5a9bf92bebcf300c069ff27 = pg.pgTable("cf_d5a9bf92bebcf300c069ff27", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5869aabcd8ced3fb2985e4de").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_45fd78a3d854547e586669e0",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d5b213341c89e73cbd02cfd6 = pg.pgTable("cf_d5b213341c89e73cbd02cfd6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2861849d919278c3fb5976d7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_130b7954bfaacfd5072af451",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d619fbd6c712044096d57490 = pg.pgTable("cf_d619fbd6c712044096d57490", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_926f177787985c1d7f476597").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c1ad6effa80338eecb40fb77",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d7a31d3942b5a52f095663c5 = pg.pgTable("cf_d7a31d3942b5a52f095663c5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c700035b545ac682d3b6cc66").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_4022a9ff6f170af1eda54e2b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d89592638d0045ae8894ebbe = pg.pgTable("cf_d89592638d0045ae8894ebbe", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bf619dec26bb436223115a75").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c7d4ead2355ee7240aeec29d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d8dc13feed469431ca47e64c = pg.pgTable("cf_d8dc13feed469431ca47e64c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2f31470fc33208ab9377784e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_9a452448eecff021f25f0d7d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d8e7243b05dfee5587b65e8b = pg.pgTable("cf_d8e7243b05dfee5587b65e8b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_285ef9735abdd07c3bac7510").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b0a7a3e589ea28bec4cce4bc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_d9a317f2b5e1db2e70cacfde = pg.pgTable("cf_d9a317f2b5e1db2e70cacfde", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b9aca849ab96e3b1c44b77f8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b575e5b016f5f9a0762da927",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_dce8ae0827ef924dafaa4aab = pg.pgTable("cf_dce8ae0827ef924dafaa4aab", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_c19ca4fc5494c48ff3761b78").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_a375d94164dce66de7010426",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_dd0ae38c1d24f663363803cb = pg.pgTable("cf_dd0ae38c1d24f663363803cb", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cd32aae2a9301009f3acb5bb").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6de2a3e7323c4c963ba9917b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_dde6f18a2ff4720ef789fbd9 = pg.pgTable("cf_dde6f18a2ff4720ef789fbd9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_6627b7f68a7aa4b754a59340").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f3834a08813b791bc4d6a59e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_de6c3d199e79deb12e4b5e85 = pg.pgTable("cf_de6c3d199e79deb12e4b5e85", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.timestamp("value", { withTimezone: true })
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_65b4676098670d8b0d4ec204").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_1bcf545092c0af1419ce3ca2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_de8027278f47bf70865420c1 = pg.pgTable("cf_de8027278f47bf70865420c1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a2fdf4d60e52e1400938fbb4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_290d28527aa6a22b889b3da9",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_df168cd35e5af7fed4298a60 = pg.pgTable("cf_df168cd35e5af7fed4298a60", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d8fb99e240935662b879634e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_69c5e4fdc91547492848cc7f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_df3363b47791d04385226b68 = pg.pgTable("cf_df3363b47791d04385226b68", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_6234e99b15558e6d4afe4d9d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ea818fc9f2a7f22393f96aba",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_df3a13ed00976e1982a114bd = pg.pgTable("cf_df3a13ed00976e1982a114bd", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e00ace01674ee68e649ecc99").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6742b83c7f632d459247755c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e001233052ae3eb9e0afb472 = pg.pgTable("cf_e001233052ae3eb9e0afb472", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f1f18e31125fecacb64acd56").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b936b148e4225f2b2d1bfe38",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e066ebbb576073ae70af1a29 = pg.pgTable("cf_e066ebbb576073ae70af1a29", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b9f3580ff0419dbacab84c51").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_0ce857ea76ff28c8b8838c28",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e08bd72fc37999bfe425856b = pg.pgTable("cf_e08bd72fc37999bfe425856b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_61c8589cad2f176311cce216").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5027875ba02433747809b3bf",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e0ede25f6b040fb92b4a9ba0 = pg.pgTable("cf_e0ede25f6b040fb92b4a9ba0", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_845aceec75b5488252fd95d0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7dbf9ecadb89d722c326a638",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e11b8b3a30832e2d5a095fd7 = pg.pgTable("cf_e11b8b3a30832e2d5a095fd7", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2901373460192477a7fd05f6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_672413ad9dc227a5bf1c9918",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e22dd565be7dca618060ec4b = pg.pgTable("cf_e22dd565be7dca618060ec4b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_a5306b69601f35df6b44588a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fcb9dc5dd6befd84ad475673",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e2b6218bc8bc2e6d596a409e = pg.pgTable("cf_e2b6218bc8bc2e6d596a409e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0282baa7cd7e5166192bc6e5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_425c447dcc909e2ef41864fa",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e2e7706ab0707f42c4fd49a8 = pg.pgTable("cf_e2e7706ab0707f42c4fd49a8", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0c59839b74c8be408d96590d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f01f1a22d19811434fe0a937",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e376725b356b0d45ebcb8b09 = pg.pgTable("cf_e376725b356b0d45ebcb8b09", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5600b020631f5a10897d6963").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_10e1ec2bd0d6ee4981857f72",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e390d2211e76d14865735375 = pg.pgTable("cf_e390d2211e76d14865735375", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_eefe9629921a2ffe58c41130").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_192d445049745749560c727b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e3b34f211e41afa4c8c290e6 = pg.pgTable("cf_e3b34f211e41afa4c8c290e6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d7610b8781b2799f0e75cac5").on(t.revision_id,t.locale),
  pg.index("ix_a9e1effc2df95ac98534b39f").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_70da76fa36d129ceaaefc85b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e3e3281c79271e3f349cd65a = pg.pgTable("cf_e3e3281c79271e3f349cd65a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4fe2652c75787720d2e631e9").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_62595923f0c279d8d7ba403a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e5c22f20cd27618e41787fb2 = pg.pgTable("cf_e5c22f20cd27618e41787fb2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f6f5de0fe90e70ab6c09f48c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_63ca78096dec4f3e89a59404",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e63826c955be1c04467a310b = pg.pgTable("cf_e63826c955be1c04467a310b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.doublePrecision("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_6de2a21443b404f721830ce7").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_71f944fc7e2b30d9c339b40e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e7b9de96bc19fd4da4ebf6c1 = pg.pgTable("cf_e7b9de96bc19fd4da4ebf6c1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4bf230112106862ef6c03b40").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_fc09710f0689ff2a9d04a266",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e7c3e92de74e85e202804cd9 = pg.pgTable("cf_e7c3e92de74e85e202804cd9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_08ac53bf1e74dd38fa9f89ff").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_b1ddfd3729abd25d0a7e4f30",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e7e4960af3dc49cd66e7e4f4 = pg.pgTable("cf_e7e4960af3dc49cd66e7e4f4", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_40ab8abf2a4bd1c4158b132f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8d937845b276e86004d4a8d2",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e80a3d7fece26f2d8d097ac6 = pg.pgTable("cf_e80a3d7fece26f2d8d097ac6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1b4796f98aac9fccb1a77b66").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f4ab6ece21dd55d38a077e84",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e8b67bb5d4afe76a306bd5b2 = pg.pgTable("cf_e8b67bb5d4afe76a306bd5b2", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f2e40c913bae9f9f9ee52e82").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_633b03676ee2d7b97c04387d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e8dd92902a797b4607e47837 = pg.pgTable("cf_e8dd92902a797b4607e47837", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5d9dbb8bbc241baa9c497372").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_de4b64302ad18714f5887352",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e8f1481023a5b73ea8faf660 = pg.pgTable("cf_e8f1481023a5b73ea8faf660", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_257b61fcf01ebd78a1774716").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ebeb3172fc225d700a7bfca7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e8fdb8f8c1aefd602d826d8a = pg.pgTable("cf_e8fdb8f8c1aefd602d826d8a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2c2ef095b47aa6eb34cd453a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3cc19074f6b90bbd3ef75fad",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e9ba09ebb5de47a167fb4147 = pg.pgTable("cf_e9ba09ebb5de47a167fb4147", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_017c1fd268428e45b32b5906").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_bc7d36244fff501966179479",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_e9ef4df589feae2e7bf74ecc = pg.pgTable("cf_e9ef4df589feae2e7bf74ecc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_913062544eb5d14460e0e2e8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_299bb662c550ed3112c1a578",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ea4e71fc03abd40cd4f5abf9 = pg.pgTable("cf_ea4e71fc03abd40cd4f5abf9", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d202f3ef9b5d553b09e2b0dd").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_afc3f4d09ff450c52f4566ed",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ea531966c32f9edd88c095dc = pg.pgTable("cf_ea531966c32f9edd88c095dc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_9d344ab47f2617564ef64625").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_33de1aaf53e4352c42145e1a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_eadb212e7320a59dcc5af18b = pg.pgTable("cf_eadb212e7320a59dcc5af18b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_fa319e3ada11c4a3bc5b2254").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cecfb79cb616858c5588987f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_eb3af47fe2ee156bae490f72 = pg.pgTable("cf_eb3af47fe2ee156bae490f72", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_229a9dd1cfb4686648fe631a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_386e1937cf98888212f19624",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_eb51779a96b85b2fe0a20a78 = pg.pgTable("cf_eb51779a96b85b2fe0a20a78", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_909f0cbf3b90aad53e473182").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f07412f108a7b4e15327304f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_eb9f134d3d7273c42e9e6cd1 = pg.pgTable("cf_eb9f134d3d7273c42e9e6cd1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_092c7ec48b3f663b4b577137").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ac2d2d507f0e17b7132febff",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ebdfc84d3944eeebeddeb0d5 = pg.pgTable("cf_ebdfc84d3944eeebeddeb0d5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_cc88f4286289468dae9a8fa0").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2767489cc7a89eb889333da4",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_eca49aaf91324c4351aa5471 = pg.pgTable("cf_eca49aaf91324c4351aa5471", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_627efbfae7fc975e17f0783a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8e1bad0849899a4e14206068",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ede5d45fba779e441a24025b = pg.pgTable("cf_ede5d45fba779e441a24025b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  search_vector: (pg.customType<{data:string}>({dataType:() => 'tsvector'}))("search_vector").notNull().generatedAlwaysAs(sql`to_tsvector('simple',coalesce("value",''))`)
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_ca574f4a34226e5c86359642").on(t.revision_id,t.locale),
  pg.index("ix_57be6ce5e4c17c7701dbe546").using('gin',t.search_vector),
  pg.foreignKey({name:"fk_929714943cdef05e1569df6f",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_eeb9b4caa097e6a5c96ed387 = pg.pgTable("cf_eeb9b4caa097e6a5c96ed387", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b73f641d4c336a2be0c428db").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_569ef924350dd48bb616bc85",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_eec46ee72bafba479320353b = pg.pgTable("cf_eec46ee72bafba479320353b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_267e4c18225cffaba275044d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7f6d3b452f1ba8053ce3d48d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

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

export const table_cf_f0c986609eec7b12191c8b83 = pg.pgTable("cf_f0c986609eec7b12191c8b83", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_43b43248bcb6459cc73f6b4f").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_96a43b3fa513208efa29730e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f102aa1a8d1f73cd07c5cbe1 = pg.pgTable("cf_f102aa1a8d1f73cd07c5cbe1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3139e1cca70750fadb617092").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_34733426ae9c11f141713fb6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f1b91a01b2e2d6b6b047f81d = pg.pgTable("cf_f1b91a01b2e2d6b6b047f81d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_3a8cffdb07233daf3e7d66c5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_f52f12f4d31dfc05106d896a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f2146dfbfaa5b356b83f6882 = pg.pgTable("cf_f2146dfbfaa5b356b83f6882", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_b300f149464306ad79617948").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c6a7b9b159d3f12f7150e2ca",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f233f3586d3d721066d9150e = pg.pgTable("cf_f233f3586d3d721066d9150e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_065efb58a38826a0de2ea30d").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c713addbfcf23e7564b8302d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f284fcf26208ec0e06d88bfa = pg.pgTable("cf_f284fcf26208ec0e06d88bfa", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_d35a1c60e556490b62ba8318").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_2361466038ed504f716c6b69",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f2a32a64231599330f13ac24 = pg.pgTable("cf_f2a32a64231599330f13ac24", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5d0f32cc55884431911f44d2").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_00ecf8b7081aa590eb9f8a78",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f550a137e133838c52f1c8dc = pg.pgTable("cf_f550a137e133838c52f1c8dc", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_76ab55fc55b8e8910d4c2e82").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_451a7b359d64b9557087e447",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f5b5e68ee8e0a37e363d4e98 = pg.pgTable("cf_f5b5e68ee8e0a37e363d4e98", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_4d7891e5ffad55c834cf2303").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_54914ea4c5c6aa55c1ba9b77",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f5bc96d222d4815f4fc33653 = pg.pgTable("cf_f5bc96d222d4815f4fc33653", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_20e5e54ad6c91eb1c4d2160c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_de111e2ce667b603f0c9ba80",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f5d8fbd2c8b904664f760e69 = pg.pgTable("cf_f5d8fbd2c8b904664f760e69", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.uuid("value"),
  target_collection_id: pg.text("target_collection_id")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1a03d9a025e28f8dba86f152").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_7804c4a6fa25331843f665d6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade"),
  pg.foreignKey({name:"fk_a232a55db64cf5d581834e0c",columns:[t.value,t.target_collection_id],foreignColumns:[ref_content_documents.id,ref_content_documents.collection_id] }).onDelete("restrict")]);

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

export const table_cf_f78c914e2167ea5963ce660a = pg.pgTable("cf_f78c914e2167ea5963ce660a", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_7004762d602c3072a1aa5216").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_c69e64ab202cdb9b8f637d82",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f7ca024010e5dc3d44ed721e = pg.pgTable("cf_f7ca024010e5dc3d44ed721e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_805562ea6b50a69e9720446a").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8487fb5473ec416367d4bbf7",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f7e21de4b7e98566fde9898b = pg.pgTable("cf_f7e21de4b7e98566fde9898b", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0360692e48767df4d7897033").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5d242796c14cabef04e8f9bc",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f8550fa279d96f44f9d9ad7d = pg.pgTable("cf_f8550fa279d96f44f9d9ad7d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_43a37f90529090a766510ddf").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_47e0fef8e16a4d5ad2a3715c",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f86e49e81c9e7e724aec552c = pg.pgTable("cf_f86e49e81c9e7e724aec552c", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.boolean("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_1b45b4e5aa965a5983c9b788").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3c30a448645e0f4d2bf9cd3d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f88fa4e7b0fad0f76e646d63 = pg.pgTable("cf_f88fa4e7b0fad0f76e646d63", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_bea83aa4e73149f28a082958").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_bc2f7e56b748834eb980af4a",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f8ef78e1d243d6869762cefa = pg.pgTable("cf_f8ef78e1d243d6869762cefa", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_dce13ab605c0d4bfb3e09a3b").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_624fc61a1f7d41a7a67cd187",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_f9ac4e44a4f32a68e69f1b50 = pg.pgTable("cf_f9ac4e44a4f32a68e69f1b50", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_68f6e4ddb2682c8738ef86c4").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8b6071d5c3f873473b804746",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fa337ef422d9eea5041a02d6 = pg.pgTable("cf_fa337ef422d9eea5041a02d6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_5b2f2788d20df0d5a14094bd").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5245b8dd68578cc42296950d",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fa658749c7d10910501500a6 = pg.pgTable("cf_fa658749c7d10910501500a6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_e1aaf55d89bd05a2dcf2e7a8").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_48f43bdabd817269a35aa667",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fad4e04f41f19a4f1493b394 = pg.pgTable("cf_fad4e04f41f19a4f1493b394", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.jsonb("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_fa2dd99ad05eef0e3956afbd").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e5fc32cb3282e5806a7e8119",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fbd0f37d4381b0c3baca525d = pg.pgTable("cf_fbd0f37d4381b0c3baca525d", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_55e2f705d55cc50e4c1f2b1e").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_ff77e8fa166666576691da7b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fc208fe77cecbe2ccac17e77 = pg.pgTable("cf_fc208fe77cecbe2ccac17e77", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_8e46e47b492443eb4f23c369").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e7498840778286fd5735f16e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fd1faadd7cb3cbaf1e904a19 = pg.pgTable("cf_fd1faadd7cb3cbaf1e904a19", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_94e5c17082a3dde98ffa4710").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_6a27284efc3222f26817f75b",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fd7e3ba78b48fd3cd250e6c6 = pg.pgTable("cf_fd7e3ba78b48fd3cd250e6c6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_0406d909e8ef8f3d89cd9ea5").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_e975f22ae80aa3fb6542657e",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fdb357d28894d9fc63579ec6 = pg.pgTable("cf_fdb357d28894d9fc63579ec6", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_247e054b3d14367541842c3c").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_107390c227499de2268cca22",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_fddf3433941b3b1e81518a92 = pg.pgTable("cf_fddf3433941b3b1e81518a92", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_01a8c5331c5b1fcf2097df24").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8a29c69d361cc2f5428abef8",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ff2c49715ff3344a4263f2b8 = pg.pgTable("cf_ff2c49715ff3344a4263f2b8", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_6f6e942087000e001a5a5b76").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_86223245eaa50e2a3d129ce6",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ff3b4e2b43e3c836fe2cf2c5 = pg.pgTable("cf_ff3b4e2b43e3c836fe2cf2c5", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_81ff3ce5d809d76dda9cff74").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_5f3c9466539d8f18d70968d1",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ff7837a47c31d4f1f6b58b06 = pg.pgTable("cf_ff7837a47c31d4f1f6b58b06", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_f9ab628e0f02c0c866027376").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_8d35145b330b775993a7a025",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ff7a72ca096d81e876af5a07 = pg.pgTable("cf_ff7a72ca096d81e876af5a07", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_60ad571bf7ce1597cd72a400").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_cca24a46faa5886703d9e444",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ff96bd33fabae812828a56a1 = pg.pgTable("cf_ff96bd33fabae812828a56a1", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value"),
  item_id: pg.uuid("item_id"),
  block_type: pg.text("block_type")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_2c7a41c8d8fed4c45fd685b6").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_3d46407270cf497aaaf53298",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cf_ffe7b0a33e5a8df3b27eb69f = pg.pgTable("cf_ffe7b0a33e5a8df3b27eb69f", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  parent_path: pg.text("parent_path").notNull(),
  position: pg.integer("position").notNull(),
  state: pg.text("state").notNull(),
  value: pg.text("value")
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale,t.parent_path,t.position] }),
  pg.index("ix_76ea704157785aa304667649").on(t.revision_id,t.locale),
  pg.foreignKey({name:"fk_640045c6c06347827f4fd126",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_ci_9ad8315da76c8848b8870f2e = pg.pgTable("ci_9ad8315da76c8848b8870f2e", {
  revision_id: pg.uuid("revision_id").notNull(),
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0"),
  p0: pg.boolean("p0").notNull(),
  b0: pg.boolean("b0").notNull(),
  k1: pg.text("k1"),
  p1: pg.boolean("p1").notNull(),
  b1: pg.boolean("b1").notNull(),
  k2: pg.text("k2"),
  p2: pg.boolean("p2").notNull(),
  b2: pg.boolean("b2").notNull()
}, (t) => [pg.primaryKey({ columns: [t.revision_id,t.locale] }),
  pg.index("ix_d0d4eb4ee34c7660c18a83eb").on(t.locale,t.k0,t.k1,t.k2,t.revision_id),
  pg.foreignKey({name:"fk_d0d4eb4ee34c7660c18a83eb",columns:[t.revision_id,t.document_id],foreignColumns:[ref_content_revisions.id,ref_content_revisions.document_id] }).onDelete("cascade")]);

export const table_cu_4b3157d1ad57acc25664c1b6 = pg.pgTable("cu_4b3157d1ad57acc25664c1b6", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_f525015f11a85b71b3cdbc8c").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_f525015f11a85b71b3cdbc8c",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const table_cu_631e9d9ab06536489ec1bf68 = pg.pgTable("cu_631e9d9ab06536489ec1bf68", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_f1e610ac618d94b19d777778").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_f1e610ac618d94b19d777778",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const table_cu_9ad8315da76c8848b8870f2e = pg.pgTable("cu_9ad8315da76c8848b8870f2e", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull(),
  k1: pg.text("k1").notNull(),
  k2: pg.text("k2").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0,t.k1,t.k2] }),
  pg.uniqueIndex("uq_3faad57ef6750a920225310f").on(t.locale,t.k0,t.k1,t.k2),
  pg.foreignKey({name:"fk_3faad57ef6750a920225310f",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const table_cu_9ebd5bf548269fa650fdc041 = pg.pgTable("cu_9ebd5bf548269fa650fdc041", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_4f8845d18ee71787b9dbdf31").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_4f8845d18ee71787b9dbdf31",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const table_cu_9fc3ba7abbb5417fdf607bd2 = pg.pgTable("cu_9fc3ba7abbb5417fdf607bd2", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_165e20ac2a57a0c66d5a175d").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_165e20ac2a57a0c66d5a175d",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const table_cu_9fc63b40de5cb1d63eac7f2f = pg.pgTable("cu_9fc63b40de5cb1d63eac7f2f", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_5481179621e4f3c7356f3eca").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_5481179621e4f3c7356f3eca",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const table_cu_d39b972415ec56d3b602e581 = pg.pgTable("cu_d39b972415ec56d3b602e581", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_adef3f37969bbb179117b763").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_adef3f37969bbb179117b763",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const table_cu_fac1ffad8f8a01b78464605c = pg.pgTable("cu_fac1ffad8f8a01b78464605c", {
  document_id: pg.uuid("document_id").notNull(),
  locale: pg.text("locale").notNull(),
  k0: pg.text("k0").notNull()
}, (t) => [pg.primaryKey({ columns: [t.document_id,t.locale,t.k0] }),
  pg.uniqueIndex("uq_cdbdc2532df6ca877ce9eb19").on(t.locale,t.k0),
  pg.foreignKey({name:"fk_cdbdc2532df6ca877ce9eb19",columns:[t.document_id],foreignColumns:[ref_content_documents.id] }).onDelete("cascade")]);

export const contentMappingFingerprint = "eb7eaa2b77fd36ed241c9c271b6ab035772267265006e37717589bd6f22c3a5c";
export const contentBehaviorHash = "cc2e051287f803667209efa775fc85d4282506c2b8ec61f82405a0e152c08b7c";
