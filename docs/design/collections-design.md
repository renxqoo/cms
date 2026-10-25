# Collections 后端设计基线

状态：定稿，2026-10-26。大级新能力，沿用 feature-dev-v2，借用设计基线、施工图、单元契约三件套；不是行为等价迁移。

## 1. 授权、范围与存量基线

用户裁决：实现 Collections 集合建模、配置编译及文档管理闭环，参考本地 Payload，遵循现有完整能力设计，先后端。分批验证不削减完整交付。参考固定于 Payload aebbf75b93e218be4b53a3c7922e0bc82924830b；只参考行为，不复制代码。

当前仅 identity/access/audit/platform 已实施；无内容表、内容 API、内容存量数据或后台内容任务。保留三工作区、Hono、PostgreSQL/Drizzle、Bun 1.4.4 开发和 Node 生产。保留既有授权锁、权限即时生效、审计原子性、严格输入、幂等及错误契约。前端属于后续阶段。用户裁决（2026-10-26）：本轮同时完整实施物理资源上传、图片处理、私有下载与恢复，允许多子 agent 以独立 worktree 并行。未落地的配置在构建期拒绝，不能将其核销为已完成。

本轮影响：content 公共入口与构建入口、应用集合配置、HTTP/DTO/OpenAPI、数据库物理计划/生成物/迁移、持久化任务、维护生命周期、架构检查及各层测试。身份/账户既有 HTTP 契约不变。

## 2. 单一配置源与稳定身份

集合使用稳定 id、API key、schemaVersion、label、fields、indexes、search、defaultSort、mode、history、singleton、locales、access 和 extensions。字段使用稳定 id、name、type、约束、默认值、本地化及读写/查询策略。稳定身份决定物理名称，API 重命名不改物理身份。保留旧 schema 解码定义直至所有历史修订及部署兼容窗口释放。

配置严格运行时校验，拒绝未知选项、重复身份/路径、保留名、非法关系/反向 join、无效索引/搜索字段及不适用版本组合。先归一化，再冻结实例注册表；函数必须具有显式 version。配置行为摘要与物理映射摘要分开。生成不读取环境、不连接服务、不依赖已有生成物。

基础字段包括 text、textarea、number、boolean、date、email、select、code、json、point；组合包括 group、array、blocks、命名 tabs；展示布局不生成数据。富文本为 version=1 的结构化树，节点注册有版本；拒绝任意 HTML/危险链接。relationship 支持单/多目标及顺序，join 为只读反向关系。locale 显式选择，写入不回退，读取仅按明确 fallback 顺序回退。

## 3. 物理计划与迁移

共享 content_documents / content_revisions 仅保存身份、指针、schema、状态及时间，不保存通用 data。配置生成集合级类型化修订表、当前及发布活跃视图唯一性保留和组合子表；JSONB 仅用于 JSON/富文本/坐标等明确字段形状。数组子项有稳定 UUID、位置、父项和 block 类型；关系具有来源修订、字段路径、目标集合/文档和顺序，真实 FK 保护归属。唯一约束覆盖 current 与 published 两个活跃视图的值并集；同文档相同键去重，其他文档不可占用任一视图的键。回收站仍保留 current 键，purge 才释放，避免恢复时无声覆盖。历史非活跃修订不占用唯一键。每个修订属于同一集合/文档；指针用复合 FK 约束。

database 的 schema-plan 仅描述列、键、索引、约束；codegen 生成确定性 SQL 与 Drizzle。content/adapters/postgres 编译语义到物理计划；应用命令装配、写生成物并核对漂移。迁移只有一条有序链，API 启动及请求不执行 DDL。ready 校验已应用 schema/映射范围；滚动兼容窗口由部署显式列出，不能用单一最新行为摘要阻断兼容旧实例。

当前无业务数据，首批为新增表。后续破坏性变更先生成显式演进报告，要求转换、回填、历史解码及回滚计划；不得自动把不同身份字段猜作重命名或执行破坏性 DDL。兼容窗口、可观测校验和删除条件随每次演进计划提交；没有双轨业务引擎。

## 4. 查询、授权与资源预算

请求 AST 支持 and/or、eq/ne/in/notIn/exists/gt/gte/lt/lte/contains、嵌套路径、关系、q、多 sort、page/pageSize、select、depth、locale/fallback 和 mode。按类型验证操作符、字段可查询权限，再编译参数化 SQL；列表/总数共用授权谓词和读模式。标识符只来自编译映射，无内存全表筛选。published 查询始终选发布修订，editing 选当前修订。

RBAC 使用真实 operationId + collection scope，默认无绑定拒绝。集合策略返回 allow/deny/类型化 where；字段 read/write/query 分别检查。策略在业务内且安全锁后执行，超管也不能绕过完整性。投影、关系目标、版本比较及任务结果再次按当前权限过滤。依赖文档值的字段策略不具 SQL 表达式时禁止查询探测。

配置层注入预算：正文 1 MiB、页上限 100、AST 节点 100/深度 8、字段深度 8、数组/blocks 每字段 1000 项、展开深度 3/节点 500、结果 2 MiB、单请求 SQL 200、同步批量 20/总受理 1000、任务领取 20、租约 30 秒、重试 3。沿用请求 15 秒、SQL 5 秒、锁 2 秒和有限连接池。任何预算触发显式失败，事务回滚；不截断为假成功。查询不新增进程定时器；维护复用现有单一有界循环。

## 5. 文档与版本契约

路径沿用 modules-and-contracts.md §4。创建、复制、自动保存、发布、恢复及任务受理要求 Idempotency-Key；更新及状态转换带 revision（正整数），过期返回 version_conflict。DTO 为 {id,collection,revision,versionId,publishedVersionId,trashedAt,createdAt,updatedAt,data}；服务端元数据禁止客户端写入。时间 UTC ISO，ID UUID；未知字段严格拒绝。

直接生效无历史、直接生效保留历史、草稿/发布保留历史三种模式。保存创建不可变修订；draft 可缺 required，但所有已填值类型、唯一及引用仍校验。publish 完整校验确定的当前修订，独立授权；unpublish 仅清空发布指针。autosave 幂等新草稿。历史恢复按当前 schema 显式解码/转换后新建修订；直接生效还要求生效写权。复制重校验唯一值及关系，不继承发布状态。

回收站取消发布；重复归档无新副作用，恢复回收站不等于恢复历史。purge 要独立权限、保留期限及外部历史引用检查；自身历史不算外部。关系删除默认 restrict；解除创建来源新修订，cascade 仅逻辑归档并逐项授权，不隐式删除历史。资源锁全局排序，竞争引用建立与清除。

历史读取独立授权、版本必须属于目标文档，diff 只比较可读字段。裁剪保护当前、发布、待执行计划以及配置保留数量/时间窗口；无历史模式及时移除无用修订。审计不记录正文/字段值；审计或幂等失败整体回滚。幂等仅存结果资源/修订引用及脱敏状态；重放也重新执行当前文档谓词和字段/媒体授权，再动态投影，不能返回旧缓存 DTO。指纹包括 collection、路径 documentId、mode 和完整规范化输入。

## 6. 持久化工作与一致性

安全锁 → 幂等 → 排序内容资源锁 → 写入/审计。事务只做 SQL/受限同步规则，不调用网络。任务受理与业务同事务，持久化 actorId、collection、目标、revision、执行时间和逐项结果。jobId 不授予访问权；查询按当前原动作/范围及资源读权投影。

定时发布绑定确定修订，执行时重新检查账户/角色/绑定/集合策略、预期 revision、归档及发布完整性。撤权为失败终态。领取通过 FOR UPDATE SKIP LOCKED，owner+generation+lease；每个逐项事务先锁任务/条目并核验 owner+generation+lease，再执行重新授权、revision CAS、业务写、审计和逐项结果；提交时仍持同一任务行锁。过期代次不得产生业务副作用，仅终态 CAS 不足以保护。终态 CAS 拒绝过期消费者。事务内纯 SQL 批量可单项事务，逐项真实成功/失败；无外部效果，不承诺网络 exactly-once。进程退出停止领取并有界等待；到期工作由另一实例重领。

扩展为受信任的版本化校验/转换及持久化提交后意图。扩展不持有结束事务权限，不能取消授权、校验及审计；异步效果由具名处理器消费持久化意图，不以未等待 Promise 实现。

## 7. 验收与生产边界

实施及测试见 collections-implementation.md 与 collections-units.md。全能力表逐项核销，独立审查、四门及 Bun/Node 跨进程旅程均为完成条件。没有执行的压测、数据库故障切换和部署演练不得声称通过；99.9%/RTO/RPO 仍为架构目标，基础设施部署需另获授权。


## 8. 资源子系统契约

content 的上传型集合客户端仅提交 uploadId，内部解析后绑定不可变清单，客户端不能提交裸 manifestId；upload 字段是关系到上传型集合并固定其清单，富文本媒体也固定清单。assets 不读取 content 私有表。assets 的事务参与能力消费 ready 会话、pin/release 来源修订清单引用、读取可用清单、登记清理；全部显式接收调用者 tx，不能结束事务。来源修订/字段/媒体文档/manifest 的绑定用于历史文件读取；HTTP 先经 content 的来源和目标权限，再交 assets 传字节。

上传会话按主体、集合、用途、目标文档/revision、期限登记。上传和图片在 SQL 事务外执行；完成绑定以短事务重新授权并核验清单。会话消费严格匹配 actor、collection、create/replace 用途及替换 document/revision；历史/复制清单复用只能由已授权媒体确定修订或来源绑定解析，裸 manifestId 不授予引用权。上传身份是 UUID，字节流单会话一个文件，先验证长度/实际 magic MIME/摘要，再提交不可变对象。替换、裁剪/焦点和 reprocess 均生成新 manifest，永不覆盖旧对象键。只允许配置批准的 PNG/JPEG/WebP/GIF 及附件 PDF；HTML/SVG/可执行文件拒绝。实际类型与声明类型不一致拒绝。

配置注入会话 20 MiB、批量 100、上传并发 4、队列 8、图片像素 40M/帧 1、处理超时 15 秒、输出 20 MiB、原件和衍生对象保留至少 PITR 7 天、会话 30 分钟。sharp 提供解码/旋转/裁剪/焦点/resize，处理配方和处理器版本纳入指纹；预算与支持格式必须由真实字节测试。生产选择共享私有 S3 提供方，开发本地驱动；本地键严格固定模式，防路径/符号链接，私有文件无静态路由。

对象有独立身份/摘要/键/状态及清单引用；一个原件可以被多个清单共享。清理竞争清单锁再排序对象锁，确认无引用/pin且超过保留窗口后登记 deleting。对象键永不复用，重复删除幂等。上传取消/到期保留上传代次、暂存前缀、在途写入责任；不以删除一次或 URL 过期当作最终回收。默认 API 代理流式上传，不签直传 URL、不启用分片；适配器能力元数据明确只支持代理上传，避免遗留不可撤销写凭据。客户端断流中止流/处理、释放容量，扫描账本回收候选对象。

content 拥有文件夹/移动/目录防环、非空删除和媒体引用查询。资源路径沿用 modules-and-contracts.md §5，操作/输入 schema 单源注册。下载支持 Content-Disposition 安全文件名、实际 Content-Type、Content-Length、ETag 和私有 no-store；鉴权后返回可取消有界流，不暴露对象键/存储凭据。处理/重新处理通过持久化任务，状态 queued/running/succeeded/failed/cancelled 和代次 CAS；批量逐项结果可查询。

部署不在本次授权中；S3 驱动使用本地可编程兼容装置验证接缝，真实账号 opt-in。共享生产桶生命周期/PITR/多故障域仍须部署阶段配置及演练，本地门禁不能证明基础设施 SLA。
