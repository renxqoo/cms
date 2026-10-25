# 功能与接口清单

状态：架构基线的功能范围，路径是本项目拟定义的新契约，不是已实现接口。DTO 的逐字段 schema、稳定错误码及 OpenAPI 在各实施批次开始前定义并测试，不猜测源系统契约。

后台账户与 RBAC 的专项草稿已补充[设计基线](user-rbac-design.md)、[施工图](user-rbac-implementation.md)及[逐字段/接口/测试契约](user-rbac-units.md)。本模块拟统一 UUID 字符串 ID，/me 的生效操作通过有界 /me/operations 投影；身份邮件严格只存摘要且不自动重投，失败由用户显式重新发起。该细化不表示已有业务实现。

## 1. 统一协议

- 管理 API 使用 /v1 前缀，JSON 字段使用 camelCase；时间为 UTC ISO 8601，ID 的类型在 schema 定稿时全局统一。
- HTTP 状态码表达真实结果：201 创建、202 明确的异步受理、204 删除，400/401/403/404/409/413/415/429/503 表示相应失败。
- 错误统一为 error 对象，含 code、稳定英文 message、requestId 和可公开的字段错误；不回显内部异常。
- 管理列表使用 page、pageSize、q、sortBy、order，结果返回 rows、total、page、pageSize。集合查询另有类型化 where、多个 sort 字段、select、depth、locale 和明确读模式；字段路径、操作符及权限由编译定义控制，不能只在内存过滤。
- 严格拒绝未知写入字段；PATCH 必须至少有一个合法变更字段。
- 更新角色、权限、菜单、绑定和文档带预期 version，冲突返回 409。高风险创建/转换操作额外定义 Idempotency-Key。
- 业务模块拥有 operationId、访问类别和范围规则；HTTP 注册引用它并添加请求/响应 schema、method/path 和速率策略。OpenAPI、权限目录和安全测试消费同一份注册结果。
- 路由、协议 schema、业务用例、查询与测试的文件归属遵循 [代码组织约定](code-organization.md)。HTTP 不导入 composition 或数据库；管理员管理的跨模块事务由 access 协调。

## 2. 身份与管理员

| 方法与路径 | 功能与关键规则 |
| --- | --- |
| POST /v1/auth/login | 邮箱/密码登录，防爆破，返回会话令牌与到期时间 |
| POST /v1/auth/logout | 吊销当前会话，重复注销语义明确 |
| POST /v1/auth/password-reset-requests | 发起重置，不暴露邮箱是否存在 |
| POST /v1/auth/password-resets | 用途校验、过期校验、单次令牌消费、吊销既有会话 |
| POST /v1/auth/invitation-acceptances | 消费邀请并设置初始密码，不接受重置用途令牌 |
| GET /v1/me | 当前账户与角色；生效操作通过有界 /v1/me/operations 投影 |
| PATCH /v1/me | 修改自身非权限资料 |
| PUT /v1/me/password | 旧密码验证、策略校验、吊销旧会话 |
| GET /v1/me/navigation | 按生效权限投影菜单，仅展示数据，不代替服务端鉴权 |
| GET /v1/me/operations | 当前允许操作投影，供后续 UI 避免硬编码与动态绑定漂移 |
| GET /v1/admins | 搜索、排序、分页和激活状态，绝不返回凭据摘要 |
| GET /v1/admins/:id | 管理员详情 |
| POST /v1/admins | 邀请制创建，账户创建结果与邮件投递结果明确区分 |
| PATCH /v1/admins/:id | 资料、角色、启停；禁止自改权限、最后超管自锁 |
| POST /v1/admins/:id/invitations | 重发邀请，原子冷却，新令牌使旧令牌失效 |

管理员注销采用状态转换，保留审计关联，不提供无明确业务意义的硬删除接口。首个超管使用离线初始化命令。

## 3. 角色、权限、菜单和接口管理

| 方法与路径 | 功能与关键规则 |
| --- | --- |
| GET /v1/roles | 角色列表，含管理员数量和授权摘要 |
| GET /v1/roles/:id | 角色详情和授权 |
| POST /v1/roles | 创建自定义角色，验证权限均存在且有效 |
| PATCH /v1/roles/:id | 修改名称、说明、状态，保护系统超管角色 |
| PUT /v1/roles/:id/permissions | 原子全量替换授权，版本冲突保护，审计增删差异 |
| DELETE /v1/roles/:id | 有管理员使用或为受保护角色时拒绝 |
| GET /v1/permissions | 权限身份列表 |
| POST /v1/permissions | 创建唯一自定义权限 code |
| PATCH /v1/permissions/:id | 名称、说明、状态；身份 code 不可变 |
| DELETE /v1/permissions/:id | 有角色、菜单或接口引用时拒绝 |
| GET /v1/navigation | 完整资源树，供权限管理维护 |
| POST /v1/navigation | 创建分组/页面/操作节点，校验父子层级 |
| PATCH /v1/navigation/:id | 修改展示信息或引用，防环和已有子节点类型冲突 |
| DELETE /v1/navigation/:id | 有子节点时拒绝 |
| GET /v1/endpoints | 真实操作目录、当前绑定、公开/仅认证/安全管理分类 |
| POST /v1/endpoint-bindings | 为可配置且尚未绑定的真实操作创建绑定 |
| PATCH /v1/endpoint-bindings/:id | 修改可配置绑定的权限，校验范围一致和预期版本 |
| DELETE /v1/endpoint-bindings/:id | 解绑后普通访问默认拒绝；受保护操作不允许解绑 |

修改鉴权规则默认仅超级管理员执行。管理员、角色、权限、接口四项业务功能保留，但菜单树和权限身份在物理模型中分开，后续 UI 可合并呈现。

接口目录与授权绑定是不同资源：一个集合操作 operationId 可有多个集合范围绑定。创建绑定指定 operationId、显式 global/collection scope 和 permissionId；operationId 与 scope 创建后不变，修改范围通过删除并创建表达。对集合路由不得使用 global 兜底。权限身份记录相同范围，不能将文章权限绑到页面操作范围。

## 4. 结构化内容

完整能力以 [Collections 与资源管理设计](collections-and-assets.md) 为准。集合不是只读目录加固定 JSON 字段，而是统一的字段、关系、本地化、查询/索引、类型生成、上传和版本引擎。集合定义随部署配置/迁移发布，管理 API 不接收任意 DDL 或可执行脚本。

| 方法与路径 | 功能与关键规则 |
| --- | --- |
| GET /v1/collections | 调用者可用的集合目录 |
| GET /v1/collections/:collection | 安全字段定义、查询/上传/版本能力及配置指纹，不返回服务端函数 |
| GET /v1/collections/:collection/documents | 嵌套/关系筛选、搜索、多字段排序、分页、投影/展开和 locale；同一权限约束 rows/total |
| POST /v1/collections/:collection/documents | 按集合模式创建草稿或直接生效内容；上传型集合绑定已验证的清单 |
| GET /v1/collections/:collection/documents/:id | 显式编辑/已发布读模式，投影与关系/字段权限一致 |
| PATCH /v1/collections/:collection/documents/:id | 保存内容，预期 revision 保护；上传型集合替换文件时消费新清单 |
| DELETE /v1/collections/:collection/documents/:id | 移入回收站并取消发布，保留可恢复的历史和引用 |
| POST /v1/collections/:collection/documents/:id/copies | 复制为新文档，重新校验唯一字段、关系与清单引用，不复制已发布状态 |
| POST /v1/collections/:collection/documents/:id/trash-restorations | 草稿模式恢复编辑可见性；直接生效模式完整校验并要求生效写权限 |
| POST /v1/collections/:collection/documents/:id/purges | 独立权限、保留期和外部引用检查，清除自身内容/历史并登记对象清理 |
| POST /v1/collections/:collection/documents/:id/autosaves | 幂等保存新草稿修订，不覆盖已发布内容或并发新修改 |
| POST /v1/collections/:collection/documents/:id/publications | 完整校验并发布当前草稿的确定版本 |
| DELETE /v1/collections/:collection/documents/:id/publication | 取消发布，不删除编辑草稿 |
| GET /v1/collections/:collection/documents/:id/versions | 版本历史，独立读取权限 |
| GET /v1/collections/:collection/documents/:id/versions/:versionId | 版本详情，校验版本属于目标文档 |
| POST /v1/collections/:collection/documents/:id/restorations | 草稿模式恢复为新草稿；直接生效且保留历史时完整校验并要求生效写权限，生成新生效修订 |
| GET /v1/collections/:collection/documents/:id/version-diff | 比较两个属于本资源的修订，仅返回可读取字段 |
| POST /v1/collections/:collection/documents/:id/publication-schedules | 定时发布确定修订；执行时复查主体、授权和当前状态 |
| DELETE /v1/collections/:collection/documents/:id/publication-schedules/:scheduleId | 有权限且属于本资源的待执行计划取消 |
| POST /v1/collections/:collection/batches | 有界批量更新、复制、回收/恢复；逐项授权、revision 和真实结果 |
| GET /v1/collections/:collection/jobs/:jobId | 查询批量、文件处理及发布计划的持久化状态和经当前权限投影的逐项结果 |

内容元数据、草稿、发布快照和版本不能让客户端跨接口写入。文档关系和文件引用分别执行目标资源授权，不能通过自动展开获取越权数据。

已归档文档重复删除不产生新副作用；恢复回收站与恢复历史是不同操作，各模式的完整语义见能力设计的模式矩阵。永久清除受外部引用及保留策略保护；关系解除创建新修订，逻辑级联不隐式清除历史。历史裁剪保护活跃、已发布、待发布修订，并原子释放引用和登记清理。引用已归档文档不展开，发布新版本时拒绝该引用。批量超过同步事务预算时返回 202、jobId 和状态位置；重新处理和定时发布同样返回可查询身份，不返回假成功。

以上路径为本项目明确拟定的接口范围；各批次先定义 DTO、operationId 和错误契约。单例配置复用该引擎并限制有效文档数量；草稿、历史、上传等按配置声明能力，不能将未实现能力默默解释为禁用。

第一阶段管理接口默认需要认证。面向外部站点的匿名已发布内容交付 API 未获单独确认，不默认开放；如纳入，必须独立规定公开字段、草稿隔离和缓存失效。

## 5. 上传型集合、资源和目录

媒体元数据使用上一节的集合文档 API，支持任意已实现字段、关系、locale、版本和查询。不建立独立固定字段的 files CRUD。content 拥有媒体业务编排，assets 提供上传会话、不可变清单及字节处理；HTTP 不直接拼装两套写入。

| 方法与路径 | 功能与关键规则 |
| --- | --- |
| POST /v1/collections/:collection/uploads | 为创建/替换建立有期限的上传会话，验证权限、配额及用途 |
| PUT /v1/collections/:collection/uploads/:uploadId/content | 受限流式上传；使用同一会话的确定对象键及用途 |
| POST /v1/collections/:collection/uploads/:uploadId/completions | 核验字节、类型和处理状态；直传通知也不能跳过验证 |
| GET /v1/collections/:collection/uploads/:uploadId | 已授权主体查询 uploading/processing/ready/failed 状态 |
| DELETE /v1/collections/:collection/uploads/:uploadId | 取消未消费会话并登记可恢复清理，不删除已绑定的内容 |
| GET /v1/collections/:collection/documents/:id/file | 按当前或有权读取的指定修订获取原件/变体；HEAD 同样授权 |
| GET /v1/collections/:collection/documents/:id/media-bindings/:bindingId/file | 从已授权来源修订解析其固定媒体清单；校验字段、绑定归属及目标媒体权限，不依赖媒体旧修订存续 |
| GET /v1/collections/:collection/documents/:id/references | 可公开的引用摘要，先过滤来源集合/文档读权 |
| POST /v1/collections/:collection/documents/:id/file-processings | 裁剪/焦点/配方重新处理，返回可查询 jobId 并创建新清单；完成绑定仍检查 revision |
| GET /v1/resources | 按已授权集合聚合媒体列表/搜索/目录；同一内容查询引擎逐集合授权 |
| GET /v1/folders | 按明确集合范围获取目录树 |
| POST /v1/folders | content 创建集合目录，验证父目录、范围与重名约束 |
| PATCH /v1/folders/:id | 重命名/移动，防循环与版本冲突；文档移入目录使用内容更新入口 |
| DELETE /v1/folders/:id | 非空目录拒绝，不隐式递归删除内容 |

原件和派生对象保持私有；替换创建新存储键，历史引用固定具体清单。批量上传由多个有界会话及逐项状态构成。直传/分片使用所选适配器已声明并验证的能力，不根据客户端自报的对象信息直接标记成功。文件处理在事务外执行，创建/替换文档时在事务内重新授权并绑定 ready 清单。

## 6. 审计与运行检查

| 方法与路径 | 功能与关键规则 |
| --- | --- |
| GET /v1/audit-logs | 按操作、操作者、目标、时间筛选审计；独立权限 |
| GET /livez | 进程存活，不泄漏依赖细节 |
| GET /readyz | 数据库、迁移、权限目录和必要存储已就绪；失败返回 503 |
| GET /openapi.json | 由真实操作生成；生产暴露策略显式配置 |

指标端点若启用，属于受网络或身份保护的运维入口，不向互联网直接公开。生产 OpenAPI 暴露策略不采用默认公开的隐含行为。
