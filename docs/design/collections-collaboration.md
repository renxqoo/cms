# Collections 并行协作契约

状态：已核销，2026-10-26。单一实现，各 agent 使用独立 worktree；主线集成验证及独立审查结果见 [验收记录](collections-verification.md)。

## 1. 模块分工

C：定义/字段/编译/查询。拥有 content/collections、fields、queries、adapters/postgres、generate.ts；database/schema-plan、codegen、schema/content、schema/generated、迁移；content/definition.ts 与 model.ts 公共数据契约。先发出接口定稿供 D 使用；不得实现 documents/jobs 顶层用例。

D：文档/版本/任务。拥有 content/documents、versions、jobs、folders、runtime.ts、composition.ts、operations.ts、input-schemas.ts、index.ts、types.ts。消费 C 的持久化与字段规则；注入 assets 事务参与能力；不实现第二套 SQL 字段映射或查询。

A：资产。拥有 cms/assets 与 API adapters/storage、adapters/images 及资产 schema/迁移，资产操作定义和 Zod 输入；提供注入 content 的事务参与能力。不可依赖 content。以 content 发起的回调承接来源授权，不开放裸 manifest 公共下载。

主线：应用配置、生成命令、runtime/HTTP/OpenAPI、架构检查、共享/e2e 测试、设计及跨模块集成。各 agent 只提交自己点名路径，不修改其他人的分工；package.json/lock 属主线，新增出口/依赖通过报告请求。

## 2. 内容公共契约先定稿

C 必须在实现开始时明确导出 definition.ts：CollectionDefinition、FieldDefinition、Where、ContentLimits、ContentRegistry、DocumentData、FieldPolicyContext、CollectionPolicyContext；model.ts：DocumentRow、RevisionRow、DocumentView、QueryInput、CompiledCollection、ContentMapping。字段/策略执行不依赖 Hono 或 SQL。授权主体使用 access 的 Principal 类型。

registry 的 get(key) 返回规范化定义、list 只读数组、behaviorHash 与 mappingHash 分开。compileContent(registry) 产生 ContentMapping，包含各集合物理表/字段映射、物理计划及 fingerprint。validateData({collection,data,mode,locale,limits}) 返回合法 DocumentData；collectReferences({collection,data,locale}) 返回目标 collection/id/path（媒体固定绑定由 D 调用 A 完成）。字段写策略由 D 在规则前执行，读/查询策略同一规范化字段驱动。

C 的存储 API 显式接受 tx 和 mapping/collection，以一个 options 对象承载：insertRevision/readRevisionData/queryDocuments/writeCurrentProjection/deleteRevisionData；以及共享资源锁/readDocument/insertDocument/updateDocumentPointers/版本读取。C 应把最终签名及数据形状在首次报告给 D/主线，不让 D 猜 SQL schema。D 可独立实现参数 schema/操作定义/状态机测试，等待 C 签名后衔接。

## 3. 资产事务参与契约

A 在 assets/composition 公开 AssetsParticipants 与 AssetsOptions/StorageDriver/ImageProcessor；assets/index 公开 AssetsApi/输入schema/操作注册，均为精确 export。

participants.bind(tx,{actorId,collectionKey,documentId,revisionId,uploadId?,authorizedManifest?,sourcePath}) 原子消费严格匹配 actor/collection/purpose/document/revision 的 ready 会话，或消费 content 通过已授权的媒体确定修订/来源绑定解析出的内部 authorizedManifest，并返回 manifest 摘要。授权证明不可由 HTTP 输入构造，客户端不接受 manifestId；releaseRevision(tx,{revisionId}) 释放该来源；readManifest(tx,{manifestId}) 返回安全元数据；resolveRevisionMedia(tx,{revisionId,sourcePath,mediaDocumentId}) 返回稳定清单。content 须先授权集合/来源/媒体目标，assets 不能以裸 ID 绕过授权。manifest 引用不保存标题或用户正文。

assets API 的受保护入口注入 AccessAuthorization、ContentAuthorizer（D 提供，消费完整 Principal、operation、mode/revision、sourcePath/binding；执行来源文档 SQL 权限谓词、字段读策略、绑定归属和目标媒体当前下载策略，再检查文档状态）和 StorageDriver/ImageProcessor；注入回调不能带事务结束能力。异步任务复用资产领取/恢复，content 任务独立业务所有权。安全锁后同事务授权/审计/完成幂等；网络不持锁。

## 4. 集成纪律

各模块不读取环境，应用集中配置默认预算。新迁移编号：C 为 0002_content.sql、集合生成从 0003；A 为 0010_assets.sql，冲突由主线统一重排但不得修改已应用校验和。测试装置不共用生产状态。所有未完成项必须明确报告，不用占位/API 类型冒充实现。
