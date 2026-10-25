# Collections UI 接口补面设计

状态：定稿，2026-10-26。级别：中；六个既有子系统端点跨层扩展，含权限/分页/异步账本一致性。复用现有业务和事务协议，补齐编辑契约、持久化工作发现及受控清理恢复，不重做内容/文件引擎。

## 1. 范围与裁决

协调方已接受本方案所述最小补面，作为完整 UI/API 闭环所需后端增量。本分支基于 main 55ec362，独立 worktree 实施，不修改前端；不自行合并 main。已交付业务不变量、Bearer、Idempotency-Key、错误信封、严格输入、当前授权、不可变清单、版本/引用保护及节点/SQL/字节预算全部保留。API 不执行 DDL或 shell。存储祖先防护不放宽，不修改用户目录权限。

## 2. 编辑契约

新增 collections.editor，GET /v1/collections/:collection/editor，collection scope、permission、可配置绑定。query 为 intent=read|create|update|autosave|copy（默认 read）、id?、locale?、mode?（默认editing）、fallback?。read 可选 editing/published 及明确 fallback；其他 intent 固定 editing、禁止 fallback。create 禁止 id；其他 intent 必须 id。原 catalog 元数据及 read schema 保留。

返回 CollectionEditor：collection、schemaVersion、behaviorHash、mappingFingerprint、intent、mode、locale、fallback、richTextNodes（自定义受信任节点 type/version 数组）、document（null 或 {id,revision,versionId,trashedAt}）、locales={default,supported,fallback}、layout、schemas={read,draft,commit}、actions、upload。所有结构为当前主体/上下文的安全投影，不是授权凭据。正式类型归 packages/cms/src/content/editor/contracts.ts，公开从 content 导出；输入纳入 contentInputSchemas。

layout 是从现有 registry 派生的树。节点包含 id/type/name?/label/path?、required/localized、write=allowed|denied|conditional，以及适用的 constraints（min/max/minLength/maxLength/precision/options/hasMany/relationTo/defaultValue）；children、blocks={id,key,label,children}[]、tabs={id,name?,label,children}[] 保留 group/array/blocks/命名和非命名 tabs/row/collapsible。数组 UUID 和 blockType 使用现有业务规则，不创造第二套字段配置。join 永远不可写。富文本只暴露受信任节点 type/version，不暴露函数。

只导出当前可读字段和可读祖先；隐藏字段的名称、标签、默认值、选项和后代均不泄露，空展示容器删除。容器 defaultValue 必须按已经授权的可见字段树递归投影，不原样复制含隐藏后代的 group/array/blocks 默认对象，也不拿默认对象伪装真实文档重算策略。read/write/query 分别处理，可读但禁止查询的字段仍可出现在编辑布局。读取策略以 documents.get 的真实读取上下文执行，write 提示以所选 intent 对应的真实操作上下文计算；不能统一使用 collections.editor。新 collections.editor 的集合 Where 必须与目标文档读取谓词相交；create 无目标时遇到非空 Where 明确拒绝。不能伪造 nextData 求写权。无写策略且操作授权允许时 write=allowed；有写策略时 conditional；不可写模式、权限/状态拒绝时 denied。actions 是 {operationId,state}[]，state 同三值，涵盖当前文档编辑/发布/历史/回收站和计划操作；有依赖候选值的策略不得输出确定 allowed。真实提交仍执行所有规则。read intent 需要文档读取权限；create 需要创建权限；其他 intent 验证源文档读取和各自操作权限。文档谓词、归属和当前状态不得绕过。

schemas.read 使用读取形态；draft/commit 使用可提交引用形态，不接受展开的文档，join 排除。静态不可写和隐藏字段不出现在写 schema。动态策略字段标记 conditional，JSON Schema 不替代自定义校验、唯一/引用和提交授权。draft/commit 表示完整候选 data 的结构，commit 对直接生效/发布完整性表达 required；不能把 commit.required 当作 PATCH 必填，wire envelope 和部分补丁继续遵循既有输入 DTO。

upload=null 或 {mimeTypes,maxBytes,recipe,maxOutputBytes,maxPixels,maxFrames,maxWidth,maxHeight,maxVariants,directUpload:false,multipart:false}，所有值来自部署实际配置及现有 uploadSettings，不暴露存储位置/凭据。为此 ContentOptions.uploadPolicy 增加 imageLimits，装配和公共装置同步。

## 3. 工作发现契约

新增 content.listJobs，GET /v1/collections/:collection/jobs，collection scope permission 可绑定。query：page 默认1，pageSize 默认20且不超过部署 maxPageSize；action?=batch|publication|extension|process|reprocess；status?=queued|running|succeeded|partial|failed|cancelled；documentId?。固定 createdAt DESC,id DESC,kind ASC。返回 {rows,total,page,pageSize}。kind 是 content|asset 判别字段。

ContentJobSummary：kind=content、id、collection、action、status、executeAt、createdAt、finishedAt、documentId、expectedRevision、requestedVersionId、total/succeeded/failed。状态和计数从可见条目投影，不返回正文、原始任务 payload 或隐藏失败原因。计划通过 action=publication&documentId 查询；requestedVersionId 来自持久化 requested_version_id，不能误用执行后清空的 version_id。AssetJobSummary：kind=asset、id、collection、action、status、attempts、failureCode、uploadId、documentId、createdAt、finishedAt；完整 manifest 继续在既有详情授权后读取。类型归 content/jobs/contracts.ts；既有内容 getJob 增加相同安全定位字段，当前逐项语义保留。

新增 assets.listUploads，GET /v1/collections/:collection/uploads，collection scope permission 可绑定。query：page/pageSize、status?（现有会话状态）、purpose?=create|replace、documentId?。返回标准分页，排序 createdAt DESC,id DESC。UploadSummary 是 UploadSessionView 去除 manifest 后的摘要，并增加 filename/declaredMimeType/declaredBytes/createdAt；详情也增加这四个同名字段。列表不逐行读取 manifest，预览按既有详情取。documentId/revision 保持原会话目标语义，授权另依据真实 bound_document_id/bound_revision_id，不把绑定身份伪装成原请求目标。没有接收进度和分块续传能力时不返回虚构进度。

列表首先验证新操作以及既有详情操作。已证实原 process job 仅看 job.document_id，合法 replace 会被错当 create；本轮必须用 owned upload 统一 list/get 上下文并补红绿回归。现有内容 job 可见性查询漏 relationScopes，列表与详情也必须共用修正后的权限计划。内容任务继续要求当前原来源动作、实际条目动作、来源和结果资源读权；非 owner 的内容任务仍可按现有详情规则访问。资产任务严格当前 actor，并复核原动作：process 与上传详情统一按 owned upload 的用途、目标和绑定修订授权：未绑定的新建需 completeUpload/create；替换或已绑定会话需当前文档读取/下载及相应固定修订资格，历史绑定额外要求 versions.get。reprocess 要 reprocess/download/get 及当前文件有效绑定和未归档。上传会话严格 actor，复用 readUpload 与 authorizeSession；超管不隐式得到他人的会话/资产任务。

新 listJobs/listUploads 的集合 Where 也必须参与资格：jobs 与来源文档谓词相交，uploads 与目标/绑定文档谓词相交，无文档 create 会话遇到非空 Where 不匹配。授权资格、投影状态和状态过滤必须先于 count/page；rows/total 使用同一 SQL 快照，不先分页再过滤。内容适配器复用查询编译器生成可见文档 relation；assets 通过 composition 的明确参数化候选 relation 能力保有表所有权，content 不硬编码 asset 表，assets 不反向依赖 content。两个列表均由 content 编排，assets 通过 composition 提供 actor/collection 限制的 jobs/uploads/fileBindings 三个固定白名单 relation；HTTP 的 assets.listUploads 注入 content.api.listUploads，assets 不反向读取 content。按有限 operation/action/locale 建授权分支，无历史逐条扫描或每 job 查询循环；页面内装饰亦批量且有界。未知/拒绝来源分支不匹配，顶层 list/detail 操作拒绝仍失败。超过编译/SQL/响应预算显式报错，不返回假空页。

## 4. 清理恢复契约

新增 assets.listCleanup GET /v1/asset-cleanups、assets.getCleanup GET /v1/asset-cleanups/:id、assets.retryCleanup POST /v1/asset-cleanups/:id/retries。均 global security，仅活动超管，不允许权限绑定扩大；POST 要 Idempotency-Key、JSON {}。

列表 query：page/pageSize、blocked 默认true、state?=pending|ready|deleting|deleted。返回标准分页，createdAt DESC,id DESC。CleanupEntry：id、state、blocked、attempts、failureCode、retainUntil、writeDeadline、nextCleanupAt、createdAt；禁止 object_key、文件路径、云配置、原始错误和正文。

retry 仅对仍 blocked 的对象接受，未知404、非 blocked 新请求409；同幂等键可重放已受理身份回执，撤权重放失败。短事务内重新授权、安全锁/资产变更 fence、CAS 解除阻塞和审计/幂等原子提交；返回202 {id,accepted:true,location}，location 为详情路径。不在 HTTP 事务中删除网络对象，不声称已经删除。维护继续核验保留期、write deadline、引用/pin、待消费会话和租约。CLI 保留，复用清理实现。

为防回收旧代次在重试后写坏账本，asset_objects 增加 cleanup_generation bigint not null default0；领取和显式重试递增，网络完成/错误回写必须匹配领取代次。旧调用仍可幂等删同一不可变 key，不得覆盖新代次状态。不清空有效租约、不绕过引用或保留；失败保留可见账本。运行角色仍仅现有精确表权限。

## 5. 预算、迁移和发布

继续页上限100、单请求SQL200、响应2MiB、请求15秒、SQL5秒、锁2秒；动态授权计划共享已有编译预算，不能因列表放大无上限。清理领取/显式重试保持维护批量上限20、provider deadline 和generation校验，不新增定时器。图片/上传沿用现有限额。

唯一新增迁移 0011_ui_api.sql，由主线汇总 cleanup_generation 及实际列表查询需要的索引；不改旧checksum、生成集合物理投影或已有对象key。先扩展迁移，再操作目录 reconcile；显式为三个新增 collection 操作配置绑定，security 操作不绑定。表结构扩展不改变旧字段，但 cleanup 工作协议不允许新旧执行者混跑。切换须先停止并排空所有旧 API 维护循环及旧 CLI 的清理调用，核对无在途旧删除，再启用新产物的领取和 HTTP retry；只加 generation 列不能拦住旧版无条件回写。回滚先停用新入口并排空新清理领取，再恢复旧产物，保留扩展列和索引，不引入旧路径别名或双收字段。部署与流量切换仍由主会话另行授权执行。观察 readyz、403/409/预算错误、列表页数/SQL数、清理代次与失败账本，删除扩展结构另走后续迁移。

## 6. 非本轮职责

前端界面和其认证状态由主会话负责；不修改前端共享文件或其 typegen/临时存储适配。不部署、不更改用户目录权限、不添加直传/分片、任意管理员代登录或强制删除能力。完成提交并 push 增量分支，精确报告共享差异，由主会话集成 main。

## 7. 独立方案审查

独立审查已通过；已落实容器默认值投影、顶层Where/对应读写上下文、cleanup协议禁止混跑、read mode/fallback及候选schema与PATCH区别五项修订。编码前契约以本文件为准，类型在实现时按第2/3/4节列出的归属落地。
