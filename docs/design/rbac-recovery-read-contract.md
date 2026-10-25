# RBAC 恢复只读接口契约

状态：契约定稿，未实施，2026-10-26。此文件响应联调方要求，先核实既有能力并冻结最小后端契约；不计入当前75个注册操作，不表示接口已可调用。

## 1. 已核实缺口

access/operations.ts中endpoints.list和permissions.list均为permission操作。删除自身读取绑定、删除相关权限身份或停用该权限后，活动超管调用普通列表仍可能403；现有写操作为security，仍可执行修复，但需要读取资源ID及version。access.myOperations仅投影当前允许的operationId和scope，不提供绑定ID、permissionId、权限状态或CAS版本，不能替代恢复读口。OpenAPI也依赖普通目录读取授权，不能承担恢复数据入口。

因此需要新增独立security只读操作。普通GET /v1/endpoints和GET /v1/permissions继续执行原授权；不为超管在普通permission操作加入隐式绕过。

## 2. 单端点及输入

拟新增access.readRecovery，GET /v1/security/recovery，module=access、scopeKind=global、access=security、bindingConfigurable=false、成功200。认证及当前活动超管身份在共享安全锁事务内重新校验；query的scopeKind/collectionKey仅筛选被读取资源，不改变端点始终global的授权范围。不接受请求体，不要求幂等键。响应private/no-store，HEAD继承同样授权。

resource必填且为endpoints|bindings|permissions；page默认1，pageSize默认部署defaultPageSize，最大部署maxPageSize（当前100）。其余筛选为精确匹配，不收自由SQL/Where或任意排序：

| resource | 可选筛选 | 固定排序 |
| --- | --- | --- |
| endpoints | operationId、module、scopeKind、collectionKey | operationId ASC、collectionKey ASC，global的null在前 |
| bindings | id、operationId、permissionId、scopeKind、collectionKey | createdAt DESC、id DESC |
| permissions | id、code、status=active|disabled、scopeKind、collectionKey | createdAt DESC、id DESC |

UUID字段为标准UUID；page/pageSize为单一正安全整数且页偏移不能溢出。未知或不适用的筛选、重复参数、非法scope组合返回400 invalid_input及fieldErrors。后者是本端点新增的严格解析要求：当前通用routeInput重复参数错误不附fieldErrors，Access旧scope校验为invalid_scope，后续实现须在本端点边界明确解析，不修改旧接口的错误语义。collectionKey仅能搭配scopeKind=collection，scopeKind=global时禁止collectionKey；不提供scope筛选时可同时返回两种范围。bindings/permissions允许精确查询已从当前配置移除但仍持久化的collectionKey，便于发现待清理引用；不能据此创建新有效绑定。

## 3. 输出

统一返回{resource,rows,total,page,pageSize}，resource决定rows类型，空末页保留完整total：

| rows类型 | 字段 |
| --- | --- |
| endpoints | operationId、module、method、path、accessKind、bindingConfigurable、scopeKind、collectionKey、binding=null或{id,permissionId,version} |
| bindings | id、version、createdAt、updatedAt、operationId、scopeKind、collectionKey、permissionId |
| permissions | id、version、createdAt、updatedAt、code、name、description、status、scopeKind、collectionKey |

字段沿用access现有目录行、Binding和Permission DTO；所有ID和version来自当前数据库，不以索引或客户端缓存代替。endpoints从本产物真实operationMap及已注册集合范围派生，包含未绑定操作；bindings读取持久化绑定，包含目标操作已撤除的记录；permissions不默认排除disabled。仅暴露完成既有修复所需元数据，不包含用户、凭据、令牌、原始数据库错误或审计正文。

## 4. 修复及安全语义

UI只有在/me确认超管且普通目录读取拒绝时，才进入明确的恢复视图；每次调用仍以后端最新授权为准。端点不能由角色permission、普通绑定或伪造前端状态授权。活动账户降为普通角色后返回403 forbidden；账户停用/归档、会话过期/撤销或未认证返回401 unauthenticated，沿用既有身份入口及错误信封。

GET不修改绑定或权限，不自动reconcile，不创建缺省权限。修复使用现有endpoints.createBinding/updateBinding/deleteBinding及permissions.create/update/delete；仍遵守幂等、version、scope、引用和审计规则。读取与修改间有竞态时既有CAS冲突返回409，UI重新读取后显式提交，不自动覆盖。删除读取绑定的结果仍在普通列表403时可经该security入口发现；恢复绑定后普通列表按原规则重新可用。

## 5. 实施与验收口径

如获授权，归属access/recovery，公开入口、输入schema、HTTP/OpenAPI及真实操作注册同批实现；不修改identity、content/assets及前端状态模型，不需要新表或迁移。持久化bindings/permissions使用有界SQL筛选/count/page，不复用allResources全表载入；endpoints有限注册目录先按查询限定页，再批量关联该页绑定。rows/total保持同事务快照，沿用SQL/锁/请求超时，不新增轮询或缓存单例。Access当前没有响应字节预算；后续实施为恢复读取新增必需装配选项recoveryMaxResponseBytes，应用配置复用contentLimits().maxResponseBytes当前2MiB，业务层在序列化后校验，超过上限返回现有409 capacity_exceeded，不硬编码底层常量。

必须先补契约及真实PG回归：删除endpoints.list自身绑定、停用permissions.list读取权限后，普通GET403而超管恢复读可给出真实ID/version；删除权限前先移除全部binding/role/navigation引用，保留仍有引用时409 resource_in_use及外键restrict，再验证权限删除后经恢复视图创建permission及binding的完整闭环；三resource分页/筛选/末页total；撤权/停用/普通管理员/跨scope拒绝；孤儿绑定和disabled权限可发现；未知/重复/越界参数400；修复写CAS冲突及重放保留；GET不修改RBAC业务数据、审计或幂等记录，保留既有IP/用户共享限流写入；字节预算溢出显式失败；完整HTTP/OpenAPI和Bun/Node恢复旅程。按feature-dev-v2中级流程实施和独立审查，四门通过后操作数才能从75变为76。

## 6. 独立审查

独立只读审查确认单security入口足以闭合恢复流程；已校准身份401/403、权限删除外键前置、限流写入、显式响应预算及新增参数错误解析五项。当前仅冻结契约，不修改运行代码、操作数或普通列表授权。
