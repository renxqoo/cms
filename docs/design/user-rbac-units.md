# CMS 后台账户与 RBAC 单元契约及测试矩阵

状态：草稿，2026-10-25；本文件定义待实施契约，不表示接口或表已存在。关联[设计基线](user-rbac-design.md)和[施工图](user-rbac-implementation.md)。适用单元按可观察业务行为划分，不按文件数量划分。

## 1. 统一协议

API 使用 /v1、camelCase JSON、UUID 字符串 ID、UTC ISO 8601 时间。输入严格拒绝未知字段；所有名称/说明字符串校验长度，不执行 HTML。邮箱按设计基线规范化，密码/token 不 trim。实体公共基础投影为 id、createdAt、updatedAt、version；会话/令牌/投递记录采用各自显式投影，不套用基础投影。

管理列表参数为 page=1、pageSize=20（1—100）、q=''（最长128）、order=desc；sortBy 默认 createdAt，仅允许该资源声明的字段，排序追加 id 作稳定次序。page 为正整数且不能溢出安全整数；超过总数返回 rows=[]，total 保持实际授权范围内总量。返回 {rows,total,page,pageSize}。q 的 %/_ 按普通字符处理，不拼接 SQL。

scope 输入平铺为 scopeKind、collectionKey：global 时 collectionKey 缺省 null 且禁止非 null；collection 时 key 必填且必须注册。没有省略 scopeKind 推断 global 的规则。读操作返回同样的两个字段；不暴露内部生成的 scope_ref。

PATCH/PUT 的预期 version 放在 JSON；DELETE 的 version 放在必填查询参数。空 PATCH、只提供 version 或未知写字段返回 400。版本必须为正整数；目标不存在 404，目标存在且版本过期 409。无变化的合法更新返回当前投影，不增加版本或成功变更审计。

管理员创建、邀请重发及角色/权限/菜单/绑定创建要求 Idempotency-Key，长度 16—128，仅允许可打印 ASCII，缺失/非法 400。同键同请求重放不重复变更或发信；同键异请求 409。规范化请求指纹不记录密码、token 或 Authorization。密码和公开 token 操作不使用此缓存。

错误结构为 {error:{code,message,requestId,fieldErrors?}}，code 为下表封闭词表，message 为稳定英文说明；fieldErrors 为字段路径与公开校验说明数组。业务结果不得包含 passwordHash、tokenHash、数据库连接信息、SMTP 原始响应或内部堆栈。所有管理响应 no-store。

| HTTP | code | 语义 |
| --- | --- | --- |
| 400 | invalid_input | 形状/长度/空补丁/未知字段/非法 ID 或排序 |
| 400 | token_invalid | 邀请/重置用途不符、过期、已用、已撤销或目标不合格，统一响应 |
| 400 | invalid_scope | 范围形状错误或未注册集合，不进入 SQL 兜底查询 |
| 401 | invalid_credentials | 登录失败，包含错误密码、未激活、停用/归档；不区分账户存在性 |
| 401 | unauthenticated | 缺失、无效、过期或撤销的会话，或账户状态无效 |
| 403 | forbidden | 无业务授权或非超管访问 security 操作 |
| 403 | endpoint_unbound | 已注册 permission 操作无有效绑定/绑定权限已停用；超管同样拒绝 |
| 403 | protected_resource | 修改系统超管角色或禁止的自身角色/状态操作 |
| 404 | not_found | 路由或经相应管理读权检查后的目标不存在 |
| 409 | version_conflict | 目标资源预期 version 不符 |
| 409 | identifier_taken | 已有邮箱/角色code/权限code，包括归档账户邮箱 |
| 409 | resource_in_use | 角色/权限/菜单删除有引用，或结构变化与现存子节点冲突 |
| 409 | binding_exists | operationId + scope 已有绑定 |
| 409 | scope_mismatch | 权限与操作/绑定的范围不一致 |
| 409 | last_super_admin | 变更将失去最后一位有效超管 |
| 409 | capacity_exceeded | 超过已定义的角色/权限/菜单/授权数量上限 |
| 409 | idempotency_conflict | 同键不同请求或同键竞争超过期限；后者附 Retry-After |
| 413 | payload_too_large | 请求体超过上限 |
| 415 | unsupported_media_type | JSON 操作不接受相应 Content-Type |
| 429 | rate_limited | IP/用户限流或管理员邀请冷却，附 Retry-After |
| 503 | temporarily_unavailable | DB、共享限流、密码计算准入或锁/连接期限失败；默认拒绝 |
| 500 | internal_error | 不公开内部原因；已提交账户不能伪称回滚，投递按显式状态表达 |

身份/授权先于受保护资源存在性检查，认证/授权失败不能通过不同 404 泄漏目标。public 请求先做形状/IP限流；token_invalid 的具体原因不外泄。取消导致连接关闭时可能没有 HTTP 响应，事务及任务仍必须按约定收敛；不能以“未收到响应”推断未提交。

## 2. 物理表合同

下列为拟议 PostgreSQL 字段，不是已执行 DDL。未注明NULL的字段均NOT NULL；created_at/updated_at均为timestamptz，初始DEFAULT now()，updated_at由后续写入用例设置。UUID 主键由应用生成；字符串长度为字符数，另受请求字节上限约束。所有 FK 使用真实约束；除明确指出的授权行级联外默认 RESTRICT。version 是 integer NOT NULL DEFAULT 1 CHECK(version>0)，修改通过比较并递增更新。

### 2.1 identity 所属

| 表 | 字段与类型 | 约束及索引 |
| --- | --- | --- |
| admins | id uuid PK；email varchar(255) NOT NULL；display_name varchar(64) NULL；role_id uuid NOT NULL；status varchar(16) DEFAULT active；version；last_login_at timestamptz NULL；created_at/updated_at | email 非空且等于 lower(btrim(email))，唯一；role_id FK roles，索引 role_id、(created_at,id)；status ∈ active/disabled/archived；lastLoginAt 不递增资料 version |
| credentials | admin_id uuid PK/FK admins；password_hash text NOT NULL；version；password_changed_at、created_at、updated_at timestamptz NOT NULL | 一账户至多一行；哈希含算法/盐/参数；从不作为公共行投影 |
| sessions | id uuid PK；admin_id uuid FK NOT NULL；token_hash bytea NOT NULL；created_at、expires_at timestamptz NOT NULL；revoked_at timestamptz NULL | token_hash 唯一且32字节；expires_at>created_at；索引(admin_id,created_at)、expires_at；单账户10个有效会话由独占锁内检查 |
| action_tokens | id uuid PK；admin_id uuid FK NOT NULL；purpose varchar(24) NOT NULL；token_hash bytea NOT NULL；created_at、expires_at；consumed_at、revoked_at NULL | purpose ∈ invitation/password_reset；摘要唯一且32字节；期限合法；consumed/revoked 终态互斥；部分唯一(admin_id,purpose) WHERE consumed_at IS NULL AND revoked_at IS NULL，签发前先撤销旧行，包含已过期未终结行 |
| email_deliveries | id uuid PK；action_token_id uuid FK UNIQUE NOT NULL；recipient varchar(255) NOT NULL；template varchar(24) NOT NULL；status varchar(16) DEFAULT pending；started_at/finished_at NULL；failure_code varchar(32) NULL；created_at/updated_at | status ∈ pending/sending/accepted/failed/unknown；仅存收件人和无秘密状态，不存正文、链接、明文或密文token；索引(status,created_at)；template 必须匹配 token 用途，事务内校验 |

email_deliveries 是一次发送尝试的观察记录，不是可重投队列。pending → sending → accepted/failed/unknown；pending → failed/unknown；超过收敛期限的 sending → unknown；终态不可再写。完成写按 status= sending 条件更新，过期维护先写 unknown 后，晚到发送者不能再覆盖 accepted。若 SMTP 接收后无法持久化最终结果，按 unknown 口径投影；不能把内存中的成功当作已记录成功。

投递时间CHECK：pending无startedAt/finishedAt；sending有startedAt但无finishedAt；accepted必须两者都有且failureCode为空；failed/unknown必须finishedAt及failureCode，startedAt可空；所有非空时间不早于createdAt，finishedAt不早于startedAt。failureCode仅允许capacity、transport_rejected、transport_timeout、transport_unknown、state_unconfirmed、interrupted，不保存提供方错误原文。表中的started_at/finished_at类型均为timestamptz。

令牌消费成功不删除行。清理顺序：先删除超过7天保留窗口且已失效令牌的投递观察行，再删除对应失效 token；会话单独清理；不得级联删除 audit_events。身份邮件本地执行器只持有活跃发送所需明文和取消句柄，不在磁盘、数据库、故障报告或快照中持久化。

### 2.2 access 所属

| 表 | 字段与类型 | 约束及索引 |
| --- | --- | --- |
| roles | id uuid PK；code varchar(64)；name varchar(128)；description varchar(512) NULL；status varchar(16) DEFAULT active；is_super boolean DEFAULT false；version；created_at/updated_at | code/name 非空，code唯一且创建后不可变；code为 `[a-z][a-z0-9_-]{0,63}`；status ∈ active/disabled；唯一部分索引 WHERE is_super，仅允许一行；is_super 时 code=super_admin 且active，反向也成立 |
| permissions | id uuid PK；code varchar(160)；name varchar(128)；description varchar(512) NULL；scope_kind varchar(16)；collection_key varchar(64) NULL；scope_ref 生成列；status varchar(16) DEFAULT active；version；created_at/updated_at | code全局唯一，小写冒号分段，至少资源:动词，最多4段；scope形状CHECK；UNIQUE(id,scope_ref)，供绑定复合FK；索引(scope_kind,collection_key) |
| role_permissions | role_id uuid FK roles ON DELETE CASCADE；permission_id uuid FK permissions RESTRICT；created_at | PK(role_id,permission_id)；反向索引(permission_id)；super角色不写授权行，use case拒绝其授权更新 |
| navigation_nodes | id uuid PK；parent_id uuid NULL FK自身；type varchar(16)；name varchar(128)；path varchar(255) NULL；icon varchar(64) NULL；sort_order integer DEFAULT 0；status varchar(16) DEFAULT active；visibility varchar(16)；permission_id uuid NULL FK；version；created_at/updated_at | type ∈ group/page/action；visibility ∈ container/authenticated/permission；group 必须 parent/path/permission为空且container；page 必须有parent/path；action 有parent、无path/icon；permission可见时必有permissionId，其余无；status active/disabled；索引(parent_id,sort_order,id)及permission_id |
| operation_catalog | operation_id varchar(128) PK；module varchar(32)；method varchar(8)；path varchar(255)；access_kind varchar(16)；scope_kind varchar(16)；binding_configurable boolean；description varchar(512) NULL；created_at/updated_at | access_kind ∈ public/authenticated/security/permission；scope_kind global/collection；可配置只能是permission；method只存实际GET/POST/PUT/PATCH/DELETE；UNIQUE(operation_id,scope_kind)；无后台修改入口 |
| endpoint_bindings | id uuid PK；operation_id varchar(128)；scope_kind varchar(16)；collection_key varchar(64) NULL；scope_ref 生成列；permission_id uuid；version；created_at/updated_at | scope形状CHECK；FK(operation_id,scope_kind)→catalog；FK(permission_id,scope_ref)→permissions；global部分唯一(operation_id)，collection部分唯一(operation_id,collection_key)；索引permission_id |

scope_ref 为数据库根据 scope_kind 与 collection_key 生成的非空值：global 或 collection:<key>。调用方不能写入；scopeKind/collectionKey 的 CHECK 与生成表达式同迁移定义，避免 nullable FK 跳过范围约束。绑定新增/修改还须在事务内检查真实操作存在、类别为 permission 且 bindingConfigurable=true、权限active、当前集合key已注册。

节点父类型、层级、防环、路径允许列表及菜单/权限引用状态由独占安全锁下业务校验；不能声称单行 CHECK 验证了跨行父类型。角色/权限code、权限/绑定scope、super角色保护由最小写能力及业务规则约束，应用DB账号没有绕过用例的公开入口；迁移账号与运行账号分离。代码内置系统读权限由发布种子初始化，允许停用/换绑的业务权限变化不能打开security操作；删除有引用的权限必须先显式解除引用。

operation_catalog 只由一次性发布核对命令写入，API进程只验证。不能把旧实例尚在使用的操作删除；当前产物的缺失/类别/范围不兼容记录使ready失败。数据库内历史操作即使存在，也不能创建本产物没有实际注册的新路由。

### 2.3 audit 与 platform 支撑

audit_events：id uuid、actor_kind(system/admin)、actor_id uuid NULL FK admins、operation_id varchar(128)、target_type varchar(64)、target_id varchar(160) NULL、request_id varchar(128)、detail jsonb、created_at。admin actor必须有actorId；系统事件可以无账户，成功变更detail记录脱敏差异，单条UTF-8序列化后不超过256KiB。授权替换只记录added/removed的UUID数组及计数；两套各2000项完全不同的UUID差异约156KiB，必须在上限内完整保存，不截断。索引(created_at,id)、(actor_id,created_at)、(target_type,target_id,created_at)。运行账号仅INSERT/SELECT，无UPDATE/DELETE；迁移维护权限独立。不得写入密码、token/摘要、邮件链接/正文、Authorization或SQL异常。

platform.idempotency_records 及 rate_limit_buckets 沿用全局平台方案，由首个批次定义正式字段和迁移，identity/access只消费其用途明确的能力。幂等唯一键为主体+操作+scope+key，记录请求指纹、脱敏结果引用、createdAt/expiresAt；限流必须支持共享原子准入与到期清理。测试覆盖键规范化、过期和竞争，不另建user专用平行实现。advisory安全锁不增加虚假业务表。

## 3. I1：邀请、激活与账户管理

Admin 投影：id、email、displayName、roleId、roleCode、status、activation(pending/activated)、version、lastLoginAt、createdAt、updatedAt；详情额外返回 invitationDelivery（null 或 {id,status,createdAt,finishedAt}）。没有密码、摘要或可恢复秘密。角色code投影只用于展示，授权仍以数据库关系判断。

| method/path | operationId / 类别 | 请求及成功结果 |
| --- | --- | --- |
| GET /admins | admins.list / permission global | 列表；sortBy允许createdAt/email/displayName/lastLoginAt；可选status/activation，不提供则不过滤；返回Admin列表 |
| GET /admins/:id | admins.get / permission global | 返回Admin详情 |
| POST /admins | admins.create / security global | {email,displayName=null,roleId} + 幂等键；201 {admin,delivery:{id,status}}，账户与token/投递记录已提交；发送状态独立 |
| PATCH /admins/:id | admins.update / security global | {version,displayName?,roleId?,status?}；200 Admin；status只接受设计状态机转换 |
| POST /admins/:id/invitations | admins.invite / security global | 空JSON对象+幂等键；201 {adminId,delivery:{id,status}}；创建一次新投递尝试，不承诺送达 |
| POST /auth/invitation-acceptances | identity.acceptInvitation / public global | {token,newPassword}；204，不自动登录 |

创建及分配只允许active角色；被分配super角色的账户仍须完成激活才计入有效超管。相同邮箱并发创建只成功一次；冲突不遗留凭据、令牌、投递或成功审计。新账户没有默认密码；邀请未激活账户登录返回统一invalid_credentials。创建/重发同事务检查冷却，发送失败也不释放冷却，避免故障时连点打爆SMTP。

普通账户管理写均为security，因此本期不增加admins:update等可委派写权限。PATCH role/status 对自己一律拒绝；名称仍可通过 /me 修改。归档不可恢复，无DELETE /admins。管理员邮箱在本期创建后不可修改。

## 4. I2：登录、会话和自身维护

| method/path | operationId / 类别 | 请求及成功结果 |
| --- | --- | --- |
| POST /auth/login | identity.login / public global | {email,password}；200 {token,tokenType:'Bearer',expiresAt}；事务提交后才返回 |
| POST /auth/logout | identity.logout / authenticated global | 无业务输入；204，吊销当前会话 |
| GET /me | access.me / authenticated global | Admin投影及role:{id,code,name,status,isSuper}；不在此返回无界权限数组 |
| PATCH /me | access.updateOwnProfile / authenticated global | {version,displayName}；200 Admin，不接受email/roleId/status |
| PUT /me/password | identity.changePassword / authenticated global | {currentPassword,newPassword}；204，含当前会话在内全部吊销，需要重新登录 |
| GET /me/navigation | access.myNavigation / authenticated global | 200 {rows}，节点为id/type/name/path/icon/children，过滤后排序；最大2000节点 |
| GET /me/operations | access.myOperations / authenticated global | page/pageSize，200分页结果，行={operationId,scopeKind,collectionKey}；只返回当前允许的已注册操作 |

原 /me “生效权限”通过有界 /me/operations 投影供UI消费，不在 /me 拼接角色完整授权表。超管的operations同样遵循permission操作有效绑定以及security分类，不返回不存在范围。公开操作不列入允许业务操作投影；自身操作可列入。包含角色的自身资料由access通过受限identity能力及本域查询组装；identity不反向读取access表，HTTP不拼装跨域业务结果。

注销的专用策略：携带可识别的已吊销/过期会话摘要也返回204，不改其它账户状态；未知格式/摘要返回401。该幂等例外仅identity.logout使用，不进入authenticated通用放行规则，不能以/v1/me前缀继承。

credential.version用于检测密码计算期间的变更，admins.version用于资料/角色/状态。旧密码验证成功后credential.version已经变化必须拒绝，不得依据计算前快照继续写。会话签发在独占锁内处理有效会话上限，删除/撤销顺序按createdAt,id稳定排序。

## 5. I3/I4：密码重置与一次邮件尝试

| method/path | operationId / 类别 | 请求及成功结果 |
| --- | --- | --- |
| POST /auth/password-reset-requests | identity.requestPasswordReset / public global | {email}；202 {accepted:true}；已知/未知、冷却、账户未激活/停用等均相同结果 |
| POST /auth/password-resets | identity.resetPassword / public global | {token,newPassword}；204，不自动登录 |

重置只对active+activated账户签发。两种action token不能互相消费；重置请求不能激活待邀请账户。无效newPassword返回invalid_input，不消费合法token；通过密码校验后并发消费只有一个成功，其余token_invalid。事务回滚时消费标记/凭据/会话/成功审计全回滚。

成功改密、重置或邀请激活均在同事务撤销该账户除本次已消费令牌外所有未终结action token；账户禁用/归档或角色分配同样撤销其未终结token。普通改密后不能继续使用改密前签发的重置链接，再启用账户不能复活停用前链接；显式重新申请才产生新令牌。

为避免公开重置申请因同步SMTP耗时泄漏账户存在性，全部身份邮件在提交后交给应用实例的有界内存执行器，HTTP响应不等待SMTP结果；执行器只接纳当前有空闲发送槽的任务，无等待队列。任务参数中的令牌明文只在内存存在，最多4个并发，任务总期限10秒（含两次短DB状态写及5秒SMTP）；容量不足记failed，本次操作仍如实返回已创建账户/投递记录，重置申请仍统一202。

执行器登记每个Promise及AbortController，捕获拒绝，shutdown停止接纳并有限排空/取消；请求返回后交由执行器负责，不再依赖已结束请求的取消信号。请求提交前取消不入队；提交后客户端断开不撤销已提交意图，若本地任务已接纳则仍有界执行。只有当前提交的调用方可提交一次；幂等重放不再提交。不会由worker扫描pending并重发，维护只将悬空状态收敛unknown。

请求返回的delivery.status一般pending；若即时无法接纳，可为failed或无法确认的unknown。管理员通过GET /admins/:id查看最近邀请投递状态；重置的投递状态不对匿名客户端公开。SMTP发送结束不改变账户创建结果。不能用固定成功文案声称邮件已送达，也不持久化可恢复邮件正文。

邮件attempt状态不会提前消费token；受理/重发、激活/重置消费、安全状态变更并发以同一安全锁及账户/令牌行状态校验。临时失败不自动签发另一token；用户显式重发时旧token立即失效。

## 6. A1：角色与授权

Role投影：id、code、name、description、status、isSuper、version、createdAt、updatedAt；列表增加adminCount（包含所有状态账户）与permissionCount。GET详情返回permissionIds，最多2000；super返回isSuper=true且permissionIds=[]，不得误解为无权。

| method/path | operationId / 类别 | 请求及成功结果 |
| --- | --- | --- |
| GET /roles | roles.list / permission global | 列表；sortBy允许createdAt/code/name |
| GET /roles/:id | roles.get / permission global | 200角色详情 |
| POST /roles | roles.create / security global | {code,name,description=null,permissionIds=[]}+幂等键；201角色详情 |
| PATCH /roles/:id | roles.update / security global | {version,name?,description?,status?}；200角色 |
| PUT /roles/:id/permissions | roles.replacePermissions / security global | {version,permissionIds}；原子全量替换，200角色详情 |
| DELETE /roles/:id?version= | roles.delete / security global | 204；有账户引用或system超管则拒绝 |

重复permissionId返回invalid_input；引用不存在/disabled权限拒绝，区别于授权为空。替换授权与更新元数据共用roles.version，并发一个成功、另一个version_conflict；审计added/removed由事务内实际旧集合与新集合求差，不在事务前取旧值。普通角色可以停用；恢复后原授权关系保留。权限停用时关系保留但不能授权使用，不能悄悄删除关联造成信息丢失。

## 7. A2：权限身份

Permission投影：id、code、name、description、scopeKind、collectionKey、status、version、createdAt、updatedAt。

| method/path | operationId / 类别 | 请求及成功结果 |
| --- | --- | --- |
| GET /permissions | permissions.list / permission global | 列表；sortBy允许createdAt/code/name；可选status/scopeKind/collectionKey，默认不过滤 |
| POST /permissions | permissions.create / security global | {code,name,description=null,scopeKind,collectionKey=null}+幂等键；201 Permission |
| PATCH /permissions/:id | permissions.update / security global | {version,name?,description?,status?}；200 Permission |
| DELETE /permissions/:id?version= | permissions.delete / security global | 204；任何角色/菜单/绑定引用都拒绝 |

PATCH code/scope/source/isSuper 等均为未知字段错误，没有“改code顺便保留旧alias”。权限名与展示名称可以独立变化；code不能用来切换原有授权语义。停用后依赖该权限的permission操作返回endpoint_unbound，角色无授权返回forbidden；可在运维观察区分，均不放行。

## 8. A3：菜单管理与投影

Navigation管理投影为id、parentId、type、name、path、icon、sortOrder、status、visibility、permissionId、version、createdAt、updatedAt及children。全树最多2000节点，name必填；sortOrder允许有符号32位整数，同序按id排序。

| method/path | operationId / 类别 | 请求及成功结果 |
| --- | --- | --- |
| GET /navigation | navigation.list / permission global | 200 {rows} 完整管理树，含disabled节点 |
| POST /navigation | navigation.create / security global | {parentId=null,type,name,path=null,icon=null,sortOrder=0,visibility,permissionId=null}+幂等键；201单节点 |
| PATCH /navigation/:id | navigation.update / security global | {version,parentId?,type?,name?,path?,icon?,sortOrder?,status?,visibility?,permissionId?}；200单节点 |
| DELETE /navigation/:id?version= | navigation.delete / security global | 204；有子节点409，不隐式递归删 |

PATCH按最终合并形状校验：改type同时补齐/清除字段，不支持保留不合法旧字段；修改parent必须在锁内检查类型、防环及目标存在。page路径来自已装配前端允许列表；icon来自相同注册的图标名允许列表，未知名invalid_input，不返回可执行代码。空允许列表时可创建group，不能创建不存在page。

菜单使用permission可见时引用active权限；permission停用后隐藏该节点，isSuper也遵循节点状态及引用有效性。authenticated页面无需角色权限，但进入实际内容API仍按绑定授权。group自身不授业务权，可见子节点为空则隐藏。菜单action用于展示，按钮真实可用性依operation投影，不把改菜单当作安全策略变更。

## 9. A4：真实接口目录与绑定

Endpoint目录投影为operationId、module、method、path、accessKind、scopeKind、bindingConfigurable；collection操作按已注册范围展开，行追加collectionKey与binding(null或{id,permissionId,version})。列表按operationId、collectionKey稳定分页，不返回退休且当前产物不存在的操作。

| method/path | operationId / 类别 | 请求及成功结果 |
| --- | --- | --- |
| GET /endpoints | endpoints.list / permission global | page/pageSize；可选module/accessKind，缺省不过滤；返回真实目录/绑定分页 |
| POST /endpoint-bindings | endpoints.createBinding / security global | {operationId,scopeKind,collectionKey=null,permissionId}+幂等键；201 Binding |
| PATCH /endpoint-bindings/:id | endpoints.updateBinding / security global | {version,permissionId}；200 Binding |
| DELETE /endpoint-bindings/:id?version= | endpoints.deleteBinding / security global | 204；缺绑定后permission操作默认拒绝 |

Binding投影为id、operationId、scopeKind、collectionKey、permissionId、version、createdAt、updatedAt。不能POST一个任意method/path；不能为public/authenticated/security、不可配置操作、已退役未注册操作或未知集合创建绑定。method/path/accessKind/configurable由真实代码定义，HTTP PATCH传入这些字段均400。HEAD不作为独立操作/绑定条目。

系统管理读取的初始权限与绑定由发布命令幂等建立；security管理写完全固定，不能通过修改绑定给普通角色获得。删除业务绑定不阻止超管调用security绑定维护入口；无需“超管跳过所有缺失绑定”的兜底。

## 10. A5：审计、初始化与发布核对

GET /audit-logs 为audit.list / permission global，默认audit:read。列表参数沿用统一分页，另支持actorId、operationId、targetType、targetId、from、to（默认不过滤）；sortBy仅createdAt。返回id、actorKind、actorId、operationId、targetType、targetId、requestId、detail、createdAt，detail仅脱敏白名单。

离线initialize-admin命令接受邮箱、显示名及安全交互输入的新密码；密码不能出现在命令行参数、日志、环境回显或脚本源码。先做密码计算，再取独占安全锁，仅在数据库不存在有效超管时创建/激活指定新账户及审计；已有有效超管时拒绝，不静默提权现有普通账户。两个初始化进程并发只允许一个成功。该命令是受控运维入口，不暴露HTTP“首次初始化”接口。

部署核对命令消费业务操作与HTTP注册生成的同一产物，幂等同步目录/初始权限/缺省绑定；不得覆盖管理员已配置绑定。新操作初始绑定明确生成，漏配时不能报告ready；用户显式解绑已有可配置业务操作是有效禁用状态，不能在每次启动被种子自动修复。目录兼容校验与“必须有默认绑定的新增操作”在发布清单区分。

本模块初始global绑定如下；业务operation定义引用唯一权限身份声明，发布命令、OpenAPI及覆盖测试共同消费，不在路由再手写一套映射。初始权限不自动授权给自定义角色。

| operationId | 初始permission.code |
| --- | --- |
| admins.list、admins.get | admins:read |
| roles.list、roles.get | roles:read |
| permissions.list | permissions:read |
| navigation.list | navigation:read |
| endpoints.list | endpoints:read |
| audit.list | audit:read |

me/auth操作按固定public/authenticated类别处理，所有security写不建立可配置绑定。内容操作及集合范围的初始权限由content操作声明提供，access不复制其词表。

## 11. 测试迁移、隔离与并发矩阵

存量不变量：保留工具的跨工作区/显式exports/无注释/无skip约束及既有测试；不修改覆盖阈值换绿，不改Collections完整能力。新规格独立列在下表，参考仓库测试仅用于发现遗漏。

| 编号 | 单元/来源 | 独立期望、边界与异常 | 目标位置及层级 |
| --- | --- | --- | --- |
| I1 | 账户创建/邀请；R1/R3 | 邮箱大小写/空白碰撞；并发创建仅一账户；无默认密码；失败无孤儿；同幂等不重发；pending不能登录；重发旧链接立即失效 | access/admins、identity/action-tokens 的__test__；真实PG、HTTP、SMTP |
| I2 | 登录/会话；R2/R5 | 正确/错误/未知/未激活/停用同失败口径；过期边界；单次及全部注销；新登录第11会话使最早失效；凭据计算间改密阻断签发 | identity就近单测/集成；HTTP及Bun/Node |
| I3 | 改密/重置 | 14/15/128/129码点、512/513字节；不trim；旧密码错误不改数据；重置不激活邀请账户；改密/禁用/角色分配使已有重置及邀请token失效；审计失败全部回滚 | identity密码/令牌单测+真实PG |
| I4 | 邮件；U3 | accepted不等于送达；拒绝/超时/断连/落库失败返回真实状态；进程崩溃不自动重投；显式重发生成新链接；匿名202与存在性无关且不等待SMTP | identity投递测试、SMTP装置、跨进程重启 |
| A1 | 角色；R4/R8 | 自定义CRUD；空授权有零业务权；重复/不存在/停用权限拒绝；系统超管保护；有归档账户引用仍不能删角色；两套各2000项完全替换仍可保存完整审计差异，不因预算冲突回滚 | access/roles单测+PG+HTTP |
| A2 | 权限；R4 | code全局唯一且不可改；scope不能改；含NULL全局绑定仍唯一；角色/菜单/接口引用阻止删除；停用立即撤权 | access/permissions、数据库约束集成 |
| A3 | 菜单；参考探针2.2/2.3 | group嵌group拒绝；page无码但authenticated显式合法；非法父类型/并发移动/改类型子节点冲突拒绝；停菜单不撤API权；空组隐藏 | access/navigation单测+PG+HTTP |
| A4 | 接口；探针2.1/R6 | 静态与参数路由顺序反转授权一致；HEAD继承GET；OPTIONS无副作用；任意URL不能造接口；scope不符拒绝；security不能改绑 | 实际Hono注册HTTP、access/endpoints、PG |
| A5 | 当前投影/审计 | 撤权后operations/nav不泄漏；分页全部行可访问；role停用只留自身操作；审计失败变更回滚；脱敏无秘密 | access查询、audit、HTTP |
| S1 | 最后超管/初始化 | A/B并发互相停用最多一成功且保留有效超管；pending超管不计数；归档不可复用邮箱；并发初始化只有一个成功 | 两真实连接+屏障；PG集成 |
| S2 | 撤权与在途写 | 共享写锁先取→写先提交；独占撤权先提交→后写拒绝；注销/改密同理；禁止锁升级及从副本鉴权 | platform/security-lock、跨模块PG并发 |
| S3 | 单次消费/版本 | 两次消费同token仅一成功；错误purpose不消耗；审计失败token仍可用；相同角色version替换/改名竞争仅一成功；旧幂等键撤权后不能读结果 | 真实PG、HTTP |
| S4 | 有界资源/故障 | DB/限流失效503；SMTP/密码并发及排队边界；取消后容量不提前释放；维护CAS不覆盖终态；退出无遗留发送/连接/句柄 | 装置故障注入、Bun/Node网络旅程 |

主体×操作×范围矩阵至少包含：匿名、pending账户、停用/归档账户、active但角色disabled、无授权角色、articles只读编辑者、articles发布者、pages只读者、超管。覆盖public、self、security、permission四类，以及global/articles/pages三个范围。对不允许组合检查状态与数据库无副作用，读操作同时检查rows、total、详情及投影不泄漏；不是只断言403。

contents相关越权由正式内容旅程验证：articles权限不得读pages，同一路由换collection参数不能绕过，历史版本、关系展开、文件引用摘要和下载都复用范围授权。这里只定义接缝责任，不把测试装置中的假内容实现当作产品交付。

每个新实现bug的用例名说明症状；先取得缺陷状态下失败证据再修复。若因首次实现无法获得旧版本失败，报告实际验证方式，不能把Tillgate探针说成本项目红测。覆盖率数字、用例数、执行命令和独立审查处置在对应实现批次记录；当前没有执行上述业务测试。
