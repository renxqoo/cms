CREATE TABLE "cf_0a667456a824cb0c20c2221d" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce("value",''))) STORED NOT NULL,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_22e686460c226e1ee4eca42b" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_a613a9142f77c0ac7732b867" ON "cf_0a667456a824cb0c20c2221d" USING btree ("revision_id","locale");
CREATE INDEX "ix_aa77214f3deccb95937051c4" ON "cf_0a667456a824cb0c20c2221d" USING gin ("search_vector");
CREATE TABLE "cf_21f6b86732a72abf00d33602" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" uuid,
  "target_collection_id" text,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_d3708415fec81a3d69208025" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE,
  CONSTRAINT "fk_b77e3d83737da872db722594" FOREIGN KEY ("value","target_collection_id") REFERENCES "content_documents" ("id","collection_id") ON DELETE RESTRICT
);
CREATE INDEX "ix_7d79e92d5990ebdae66e9d9d" ON "cf_21f6b86732a72abf00d33602" USING btree ("revision_id","locale");
CREATE TABLE "cf_280f50f4a07d1f985ae45183" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce("value",''))) STORED NOT NULL,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_ec57fd4ce678ffd369bb178e" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_dd49413c692ec0c2036715b6" ON "cf_280f50f4a07d1f985ae45183" USING btree ("revision_id","locale");
CREATE INDEX "ix_d49cc086e7a35274ec12fb3e" ON "cf_280f50f4a07d1f985ae45183" USING btree ("value","locale","revision_id");
CREATE INDEX "ix_de0d62b97db6b79cc42ec1dd" ON "cf_280f50f4a07d1f985ae45183" USING gin ("search_vector");
CREATE TABLE "cf_3e0e80a7fcfece8499494729" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce("value",''))) STORED NOT NULL,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_8f180ac8ffe6bc4a903e5f6a" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_6f853c45c124f80ce35dde14" ON "cf_3e0e80a7fcfece8499494729" USING btree ("revision_id","locale");
CREATE INDEX "ix_713142a168d9df4c73d442d0" ON "cf_3e0e80a7fcfece8499494729" USING gin ("search_vector");
CREATE TABLE "cf_42da07b7f18f954621ae7ee5" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" jsonb,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_5c2b08789d17eff8f05480b7" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_bea00b7d6a39c5e589110634" ON "cf_42da07b7f18f954621ae7ee5" USING btree ("revision_id","locale");
CREATE TABLE "cf_4feb0997e56246a822486a3d" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_a80297c9624f42355017f54f" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_c529cc5fe7a7e8c20732a0d5" ON "cf_4feb0997e56246a822486a3d" USING btree ("revision_id","locale");
CREATE INDEX "ix_c97ecc7bdd6d06a4e2d53daf" ON "cf_4feb0997e56246a822486a3d" USING btree ("value","locale","revision_id");
CREATE TABLE "cf_52372aed6ba38c9b2a3046b3" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_a5b09833b487e617510c4884" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_d5e5b0184614aa207b8377d1" ON "cf_52372aed6ba38c9b2a3046b3" USING btree ("revision_id","locale");
CREATE TABLE "cf_8645764707487508dbdfe7bc" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_981d31349f7ee6a1ccbd64fa" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_c51d54af19d524e1481abbca" ON "cf_8645764707487508dbdfe7bc" USING btree ("revision_id","locale");
CREATE INDEX "ix_cf143c9b4608adb7d8449faa" ON "cf_8645764707487508dbdfe7bc" USING btree ("value","locale","revision_id");
CREATE TABLE "cf_88216a9806aa317f2d47b3ad" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_26c7881fc008321f52c30f6a" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_4609686e7e4715f9ff53058f" ON "cf_88216a9806aa317f2d47b3ad" USING btree ("revision_id","locale");
CREATE TABLE "cf_8d4ab27c16c5eec057b3dac4" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" jsonb,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_bc094d8f936880141a6c48b9" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_2bb2abfd35ba2a31446ed53a" ON "cf_8d4ab27c16c5eec057b3dac4" USING btree ("revision_id","locale");
CREATE TABLE "cf_9364ab8dd417df11b960c946" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce("value",''))) STORED NOT NULL,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_a719677a5f8367122b5cd292" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_3a88f2ba457d5f0d3ecbc286" ON "cf_9364ab8dd417df11b960c946" USING btree ("revision_id","locale");
CREATE INDEX "ix_137a46e77226b3a6db9b42be" ON "cf_9364ab8dd417df11b960c946" USING gin ("search_vector");
CREATE TABLE "cf_9af8ce6231cbfd87a30bbe1b" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" uuid,
  "target_collection_id" text,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_2f675627ea75ce9efba1ea59" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE,
  CONSTRAINT "fk_3fe1ba54fe4113625f333945" FOREIGN KEY ("value","target_collection_id") REFERENCES "content_documents" ("id","collection_id") ON DELETE RESTRICT
);
CREATE INDEX "ix_8ede323584972a172626c303" ON "cf_9af8ce6231cbfd87a30bbe1b" USING btree ("revision_id","locale");
CREATE TABLE "cf_b9c53070455cfc660071e87a" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce("value",''))) STORED NOT NULL,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_a5ef083c8e81c353518f2c55" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_f5b5b074d62f92841cc6ea2b" ON "cf_b9c53070455cfc660071e87a" USING btree ("revision_id","locale");
CREATE INDEX "ix_8709f5ba2eaf8a97c3a0de55" ON "cf_b9c53070455cfc660071e87a" USING btree ("value","locale","revision_id");
CREATE INDEX "ix_2f75fc2691e80147d4fc1db6" ON "cf_b9c53070455cfc660071e87a" USING gin ("search_vector");
CREATE TABLE "cf_cfc695e6d66f296feb65bd73" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" uuid,
  "target_collection_id" text,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_920757954dc1a9e62f9b2178" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE,
  CONSTRAINT "fk_cfabec6aa532777096d8c467" FOREIGN KEY ("value","target_collection_id") REFERENCES "content_documents" ("id","collection_id") ON DELETE RESTRICT
);
CREATE INDEX "ix_e0391e47193e74053310c663" ON "cf_cfc695e6d66f296feb65bd73" USING btree ("revision_id","locale");
CREATE TABLE "cf_f02fa48abcf081f19822bfc9" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple',coalesce("value",''))) STORED NOT NULL,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_ce0d5e3c6c8f703ac0e137f6" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_46bf870e28763d53c24e8398" ON "cf_f02fa48abcf081f19822bfc9" USING btree ("revision_id","locale");
CREATE INDEX "ix_a34aad597dc43548dda6a99f" ON "cf_f02fa48abcf081f19822bfc9" USING gin ("search_vector");
CREATE TABLE "cf_f7172e3130217995c9960995" (
  "revision_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "parent_path" text NOT NULL,
  "position" integer NOT NULL,
  "state" text NOT NULL,
  "value" text,
  PRIMARY KEY ("revision_id","locale","parent_path","position"),
  CONSTRAINT "fk_d60b7aa4d3189d6f5f120e34" FOREIGN KEY ("revision_id","document_id") REFERENCES "content_revisions" ("id","document_id") ON DELETE CASCADE
);
CREATE INDEX "ix_8c6b455e1557487edc5bb7c6" ON "cf_f7172e3130217995c9960995" USING btree ("revision_id","locale");
CREATE TABLE "cu_4b3157d1ad57acc25664c1b6" (
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "k0" text NOT NULL,
  PRIMARY KEY ("document_id","locale","k0"),
  CONSTRAINT "fk_f525015f11a85b71b3cdbc8c" FOREIGN KEY ("document_id") REFERENCES "content_documents" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_f525015f11a85b71b3cdbc8c" ON "cu_4b3157d1ad57acc25664c1b6" USING btree ("locale","k0");
CREATE TABLE "cu_d39b972415ec56d3b602e581" (
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "k0" text NOT NULL,
  PRIMARY KEY ("document_id","locale","k0"),
  CONSTRAINT "fk_adef3f37969bbb179117b763" FOREIGN KEY ("document_id") REFERENCES "content_documents" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_adef3f37969bbb179117b763" ON "cu_d39b972415ec56d3b602e581" USING btree ("locale","k0");
SELECT cms_register_content_schema('articles',1,'54017320837d84c322bbc620902f482d6af28f17ee08829e8ad94d88fa35eedd');
SELECT cms_register_content_schema('media',1,'2ce10526ffba8cca62a899b56c6ee766b192710a7eec85b544ecfe25061a9aa2');
SELECT cms_register_content_schema('pages',1,'c6ae2083f67e96e38591f0489f7705b400c5b538b2a8df9b6e12b03eac9eea6c');
SELECT cms_register_content_schema('settings',1,'5b3a9a442798773344f315d77d524126ff7c0b61257056391597c4f6fc194b89');
INSERT INTO content_schema_control(collection_id,schema_version) VALUES('articles',1);
INSERT INTO content_schema_control(collection_id,schema_version) VALUES('media',1);
INSERT INTO content_schema_control(collection_id,schema_version) VALUES('pages',1);
INSERT INTO content_schema_control(collection_id,schema_version) VALUES('settings',1);
INSERT INTO content_schema_manifests(fingerprint,plan,status) VALUES('bfea4f30faff51f03fc9473eb5fa9de1a98e21de57381b7930fba421d642d401','{"version":1,"tables":[{"name":"cf_0a667456a824cb0c20c2221d","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true},{"name":"search_vector","type":"tsvector","generated":{"kind":"textSearch","column":"value"}}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_a613a9142f77c0ac7732b867","columns":["revision_id","locale"]},{"name":"ix_aa77214f3deccb95937051c4","columns":["search_vector"],"method":"gin"}],"foreignKeys":[{"name":"fk_22e686460c226e1ee4eca42b","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_21f6b86732a72abf00d33602","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"uuid","nullable":true},{"name":"target_collection_id","type":"text","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_7d79e92d5990ebdae66e9d9d","columns":["revision_id","locale"]}],"foreignKeys":[{"name":"fk_d3708415fec81a3d69208025","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"},{"name":"fk_b77e3d83737da872db722594","columns":["value","target_collection_id"],"targetTable":"content_documents","targetColumns":["id","collection_id"],"onDelete":"restrict"}]},{"name":"cf_280f50f4a07d1f985ae45183","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true},{"name":"search_vector","type":"tsvector","generated":{"kind":"textSearch","column":"value"}}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_dd49413c692ec0c2036715b6","columns":["revision_id","locale"]},{"name":"ix_d49cc086e7a35274ec12fb3e","columns":["value","locale","revision_id"]},{"name":"ix_de0d62b97db6b79cc42ec1dd","columns":["search_vector"],"method":"gin"}],"foreignKeys":[{"name":"fk_ec57fd4ce678ffd369bb178e","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_3e0e80a7fcfece8499494729","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true},{"name":"search_vector","type":"tsvector","generated":{"kind":"textSearch","column":"value"}}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_6f853c45c124f80ce35dde14","columns":["revision_id","locale"]},{"name":"ix_713142a168d9df4c73d442d0","columns":["search_vector"],"method":"gin"}],"foreignKeys":[{"name":"fk_8f180ac8ffe6bc4a903e5f6a","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_42da07b7f18f954621ae7ee5","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"jsonb","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_bea00b7d6a39c5e589110634","columns":["revision_id","locale"]}],"foreignKeys":[{"name":"fk_5c2b08789d17eff8f05480b7","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_4feb0997e56246a822486a3d","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_c529cc5fe7a7e8c20732a0d5","columns":["revision_id","locale"]},{"name":"ix_c97ecc7bdd6d06a4e2d53daf","columns":["value","locale","revision_id"]}],"foreignKeys":[{"name":"fk_a80297c9624f42355017f54f","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_52372aed6ba38c9b2a3046b3","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_d5e5b0184614aa207b8377d1","columns":["revision_id","locale"]}],"foreignKeys":[{"name":"fk_a5b09833b487e617510c4884","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_8645764707487508dbdfe7bc","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_c51d54af19d524e1481abbca","columns":["revision_id","locale"]},{"name":"ix_cf143c9b4608adb7d8449faa","columns":["value","locale","revision_id"]}],"foreignKeys":[{"name":"fk_981d31349f7ee6a1ccbd64fa","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_88216a9806aa317f2d47b3ad","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_4609686e7e4715f9ff53058f","columns":["revision_id","locale"]}],"foreignKeys":[{"name":"fk_26c7881fc008321f52c30f6a","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_8d4ab27c16c5eec057b3dac4","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"jsonb","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_2bb2abfd35ba2a31446ed53a","columns":["revision_id","locale"]}],"foreignKeys":[{"name":"fk_bc094d8f936880141a6c48b9","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_9364ab8dd417df11b960c946","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true},{"name":"search_vector","type":"tsvector","generated":{"kind":"textSearch","column":"value"}}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_3a88f2ba457d5f0d3ecbc286","columns":["revision_id","locale"]},{"name":"ix_137a46e77226b3a6db9b42be","columns":["search_vector"],"method":"gin"}],"foreignKeys":[{"name":"fk_a719677a5f8367122b5cd292","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_9af8ce6231cbfd87a30bbe1b","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"uuid","nullable":true},{"name":"target_collection_id","type":"text","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_8ede323584972a172626c303","columns":["revision_id","locale"]}],"foreignKeys":[{"name":"fk_2f675627ea75ce9efba1ea59","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"},{"name":"fk_3fe1ba54fe4113625f333945","columns":["value","target_collection_id"],"targetTable":"content_documents","targetColumns":["id","collection_id"],"onDelete":"restrict"}]},{"name":"cf_b9c53070455cfc660071e87a","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true},{"name":"search_vector","type":"tsvector","generated":{"kind":"textSearch","column":"value"}}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_f5b5b074d62f92841cc6ea2b","columns":["revision_id","locale"]},{"name":"ix_8709f5ba2eaf8a97c3a0de55","columns":["value","locale","revision_id"]},{"name":"ix_2f75fc2691e80147d4fc1db6","columns":["search_vector"],"method":"gin"}],"foreignKeys":[{"name":"fk_a5ef083c8e81c353518f2c55","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_cfc695e6d66f296feb65bd73","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"uuid","nullable":true},{"name":"target_collection_id","type":"text","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_e0391e47193e74053310c663","columns":["revision_id","locale"]}],"foreignKeys":[{"name":"fk_920757954dc1a9e62f9b2178","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"},{"name":"fk_cfabec6aa532777096d8c467","columns":["value","target_collection_id"],"targetTable":"content_documents","targetColumns":["id","collection_id"],"onDelete":"restrict"}]},{"name":"cf_f02fa48abcf081f19822bfc9","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true},{"name":"search_vector","type":"tsvector","generated":{"kind":"textSearch","column":"value"}}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_46bf870e28763d53c24e8398","columns":["revision_id","locale"]},{"name":"ix_a34aad597dc43548dda6a99f","columns":["search_vector"],"method":"gin"}],"foreignKeys":[{"name":"fk_ce0d5e3c6c8f703ac0e137f6","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cf_f7172e3130217995c9960995","columns":[{"name":"revision_id","type":"uuid"},{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"parent_path","type":"text"},{"name":"position","type":"integer"},{"name":"state","type":"text"},{"name":"value","type":"text","nullable":true}],"primaryKey":["revision_id","locale","parent_path","position"],"indexes":[{"name":"ix_8c6b455e1557487edc5bb7c6","columns":["revision_id","locale"]}],"foreignKeys":[{"name":"fk_d60b7aa4d3189d6f5f120e34","columns":["revision_id","document_id"],"targetTable":"content_revisions","targetColumns":["id","document_id"],"onDelete":"cascade"}]},{"name":"cu_4b3157d1ad57acc25664c1b6","columns":[{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"k0","type":"text"}],"primaryKey":["document_id","locale","k0"],"indexes":[{"name":"uq_f525015f11a85b71b3cdbc8c","columns":["locale","k0"],"unique":true}],"foreignKeys":[{"name":"fk_f525015f11a85b71b3cdbc8c","columns":["document_id"],"targetTable":"content_documents","targetColumns":["id"],"onDelete":"cascade"}]},{"name":"cu_d39b972415ec56d3b602e581","columns":[{"name":"document_id","type":"uuid"},{"name":"locale","type":"text"},{"name":"k0","type":"text"}],"primaryKey":["document_id","locale","k0"],"indexes":[{"name":"uq_adef3f37969bbb179117b763","columns":["locale","k0"],"unique":true}],"foreignKeys":[{"name":"fk_adef3f37969bbb179117b763","columns":["document_id"],"targetTable":"content_documents","targetColumns":["id"],"onDelete":"cascade"}]}]}'::jsonb,'ready') ON CONFLICT(fingerprint) DO NOTHING;
