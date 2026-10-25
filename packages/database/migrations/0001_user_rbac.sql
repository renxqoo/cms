CREATE TABLE roles (
  id uuid PRIMARY KEY,
  code varchar(64) NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_-]{0,63}$'),
  name varchar(128) NOT NULL CHECK (length(btrim(name)) > 0),
  description varchar(512),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  is_super boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_super_shape CHECK ((is_super AND code='super_admin' AND status='active') OR (NOT is_super AND code<>'super_admin'))
);
CREATE UNIQUE INDEX roles_one_super ON roles(is_super) WHERE is_super;
INSERT INTO roles(id,code,name,is_super) VALUES(gen_random_uuid(),'super_admin','Super administrator',true);
CREATE TABLE admins (
  id uuid PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE CHECK (email=lower(btrim(email)) AND length(email)>0),
  display_name varchar(64),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled','archived')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admins_role_id_idx ON admins(role_id);
CREATE INDEX admins_created_idx ON admins(created_at,id);
CREATE TABLE credentials (
  admin_id uuid PRIMARY KEY REFERENCES admins(id) ON DELETE RESTRICT,
  password_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK(expires_at>created_at),
  CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE INDEX sessions_admin_idx ON sessions(admin_id,created_at,id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);
CREATE TABLE action_tokens (
  id uuid PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  purpose varchar(24) NOT NULL CHECK(purpose IN('invitation','password_reset')),
  token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK(expires_at>created_at),
  CHECK(consumed_at IS NULL OR revoked_at IS NULL),
  CHECK(consumed_at IS NULL OR consumed_at>=created_at),
  CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE UNIQUE INDEX action_tokens_one_live ON action_tokens(admin_id,purpose) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX action_tokens_expires_idx ON action_tokens(expires_at);
CREATE TABLE email_deliveries (
  id uuid PRIMARY KEY,
  action_token_id uuid NOT NULL UNIQUE REFERENCES action_tokens(id) ON DELETE RESTRICT,
  recipient varchar(255) NOT NULL,
  template varchar(24) NOT NULL CHECK(template IN('invitation','password_reset')),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','accepted','failed','unknown')),
  started_at timestamptz,
  finished_at timestamptz,
  failure_code varchar(32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(failure_code IS NULL OR failure_code IN('capacity','transport_rejected','transport_timeout','transport_unknown','state_unconfirmed','interrupted')),
  CHECK(started_at IS NULL OR started_at>=created_at),
  CHECK(finished_at IS NULL OR finished_at>=created_at),
  CHECK(finished_at IS NULL OR started_at IS NULL OR finished_at>=started_at),
  CONSTRAINT email_deliveries_state_shape CHECK(
    (status='pending' AND started_at IS NULL AND finished_at IS NULL AND failure_code IS NULL) OR
    (status='sending' AND started_at IS NOT NULL AND finished_at IS NULL AND failure_code IS NULL) OR
    (status='accepted' AND started_at IS NOT NULL AND finished_at IS NOT NULL AND failure_code IS NULL) OR
    (status IN('failed','unknown') AND finished_at IS NOT NULL AND failure_code IS NOT NULL)
  )
);
CREATE INDEX email_deliveries_state_idx ON email_deliveries(status,created_at);
CREATE TABLE permissions (
  id uuid PRIMARY KEY,
  code varchar(160) NOT NULL UNIQUE CHECK(code ~ '^[a-z][a-z0-9_-]*(:[a-z][a-z0-9_-]*){1,3}$'),
  name varchar(128) NOT NULL CHECK(length(btrim(name))>0),
  description varchar(512),
  scope_kind varchar(16) NOT NULL CHECK(scope_kind IN('global','collection')),
  collection_key varchar(64),
  scope_ref text GENERATED ALWAYS AS (CASE WHEN scope_kind='global' THEN 'global' ELSE 'collection:' || collection_key END) STORED NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((scope_kind='global' AND collection_key IS NULL) OR (scope_kind='collection' AND collection_key ~ '^[a-z][a-z0-9_-]{0,63}$')),
  UNIQUE(id,scope_ref)
);
CREATE INDEX permissions_scope_idx ON permissions(scope_kind,collection_key);
CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(role_id,permission_id)
);
CREATE INDEX role_permissions_permission_idx ON role_permissions(permission_id);
CREATE TABLE navigation_nodes (
  id uuid PRIMARY KEY,
  parent_id uuid REFERENCES navigation_nodes(id) ON DELETE RESTRICT,
  type varchar(16) NOT NULL CHECK(type IN('group','page','action')),
  name varchar(128) NOT NULL CHECK(length(btrim(name))>0),
  path varchar(255),
  icon varchar(64),
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  visibility varchar(16) NOT NULL CHECK(visibility IN('container','authenticated','permission')),
  permission_id uuid REFERENCES permissions(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(parent_id IS NULL OR parent_id<>id),
  CHECK((visibility='permission' AND permission_id IS NOT NULL) OR (visibility<>'permission' AND permission_id IS NULL)),
  CHECK((type='group' AND parent_id IS NULL AND path IS NULL AND visibility='container') OR
        (type='page' AND parent_id IS NOT NULL AND path IS NOT NULL AND visibility IN('authenticated','permission')) OR
        (type='action' AND parent_id IS NOT NULL AND path IS NULL AND icon IS NULL AND visibility IN('authenticated','permission')))
);
CREATE INDEX navigation_parent_idx ON navigation_nodes(parent_id,sort_order,id);
CREATE INDEX navigation_permission_idx ON navigation_nodes(permission_id);
CREATE TABLE operation_catalog (
  operation_id varchar(128) PRIMARY KEY,
  module varchar(32) NOT NULL,
  method varchar(8) NOT NULL CHECK(method IN('GET','POST','PUT','PATCH','DELETE')),
  path varchar(255) NOT NULL,
  access_kind varchar(16) NOT NULL CHECK(access_kind IN('public','authenticated','security','permission')),
  scope_kind varchar(16) NOT NULL CHECK(scope_kind IN('global','collection')),
  binding_configurable boolean NOT NULL,
  description varchar(512),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(NOT binding_configurable OR access_kind='permission'),
  UNIQUE(operation_id,scope_kind)
);
CREATE TABLE endpoint_bindings (
  id uuid PRIMARY KEY,
  operation_id varchar(128) NOT NULL,
  scope_kind varchar(16) NOT NULL CHECK(scope_kind IN('global','collection')),
  collection_key varchar(64),
  scope_ref text GENERATED ALWAYS AS (CASE WHEN scope_kind='global' THEN 'global' ELSE 'collection:' || collection_key END) STORED NOT NULL,
  permission_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((scope_kind='global' AND collection_key IS NULL) OR (scope_kind='collection' AND collection_key ~ '^[a-z][a-z0-9_-]{0,63}$')),
  FOREIGN KEY(operation_id,scope_kind) REFERENCES operation_catalog(operation_id,scope_kind) ON DELETE RESTRICT,
  FOREIGN KEY(permission_id,scope_ref) REFERENCES permissions(id,scope_ref) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX endpoint_bindings_global_uq ON endpoint_bindings(operation_id) WHERE scope_kind='global';
CREATE UNIQUE INDEX endpoint_bindings_collection_uq ON endpoint_bindings(operation_id,collection_key) WHERE scope_kind='collection';
CREATE INDEX endpoint_bindings_permission_idx ON endpoint_bindings(permission_id);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  actor_kind varchar(16) NOT NULL CHECK(actor_kind IN('system','admin')),
  actor_id uuid REFERENCES admins(id) ON DELETE RESTRICT,
  operation_id varchar(128) NOT NULL,
  target_type varchar(64) NOT NULL,
  target_id varchar(160),
  request_id varchar(128) NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(actor_kind<>'admin' OR actor_id IS NOT NULL)
);
CREATE INDEX audit_created_idx ON audit_events(created_at,id);
CREATE INDEX audit_actor_idx ON audit_events(actor_id,created_at);
CREATE INDEX audit_target_idx ON audit_events(target_type,target_id,created_at);
CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  operation_id varchar(128) NOT NULL,
  scope_ref text NOT NULL,
  key varchar(128) NOT NULL,
  fingerprint char(64) NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(actor_id,operation_id,scope_ref,key),
  CHECK(expires_at>created_at)
);
CREATE INDEX idempotency_expires_idx ON idempotency_records(expires_at);
CREATE TABLE rate_limit_buckets (
  key varchar(128) PRIMARY KEY,
  count integer NOT NULL CHECK(count>0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX rate_limit_expires_idx ON rate_limit_buckets(expires_at);
CREATE FUNCTION cms_protect_audit_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append only' USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
FOR EACH STATEMENT EXECUTE FUNCTION cms_protect_audit_events();
