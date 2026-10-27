# Collections 文档业务契约

本文记录 `content` 文档、版本、文件夹和任务模块的公开行为；字段定义、物理映射及查询编译遵循 `collections-design.md`。

## 装配与边界

`createContent` 从 `content/composition` 导出，接收 registry、mapping、数据库、资源预算、工作策略、会话授权和可信 actor 授权。媒体集合必须注入 AssetsParticipants 和同一 AssetsApi 实例。返回 `api`、`uploads`、`authorizeMedia`、`participants.commitProcessing`、`verifyReady`、`maintenance`、`stop` 和 `close`。

HTTP 只消费注入的 `ContentApi` 与 `ContentUploadsApi`。可信后台装配使用 `authorizeMedia` 和 `commitProcessing`；它们参与调用方已持有的事务，不自行提交或建立第二条存储路径。

`verifyReady(signal)` 在可取消事务中核验物理映射、schema 状态及工作迁移。`stop` 立即停止领取并取消模块活动；`close` 同时等待活动收敛，不关闭共享数据库或外部存储。

所有写事务按安全共享锁、统一 content 变更 fence、幂等记录、业务行锁的顺序执行。content 与 assets 使用相同的配置 `resourceLockKey`。普通读取及下载不取得写 fence。

## 文档与语言写入

创建、更新、自动保存和复制覆盖值提供两种互斥输入：

- `locale?` 与 `data`，只指定一个语言的字段补丁。
- `dataByLocale`，一次原子提交多个语言补丁；不得同时提交 `locale` 或 `data`。

语言键必须属于集合配置，映射至少包含一个语言，并受 `maxLocales` 限制。文档、文件夹及批量条目的 revision/version 输入是正 int32，与 PostgreSQL 列范围一致。

所有单语言和多语言写入都使用 `normalizeLocaleData`。普通字段只替换显式提交的值；group 递归合并。array/blocks 显式替换顺序与成员，同 stable ID 的条目递归合并字段。未请求语言的本地化值保留，新增条目 ID 在各语言间只生成一次。

非本地化字段、容器成员、顺序和 stable ID 是一个共享事实。多个语言显式提交矛盾值、顺序、ID 或 blockType 时，整个事务返回 `invalid_input`；缺少一个语言的共享字段可由其他语言的显式值规范化。共享变化传播到所有受影响语言，并逐语言检查字段写权限。

显式提交 `write:false` 字段即使等于原值也拒绝。未提交的秘密子字段保留；显式 null、移除旧条目或同 ID 更换 blockType 都检查被删除的旧后代权限。字段授权同时获得 previousData、nextData、locale、mode 和真实 operationId。

创建时共享默认值只决策一次；本地化默认值只应用于原始请求包含的语言。默认值不算用户显式补丁。草稿允许缺失 required 值，但始终验证类型、结构和资源预算。

集合启用 `localizeStatus` 时，各语言具有独立发布修订，发布和撤回只影响请求 locale，缺省使用默认语言；只对该语言的有效读取值执行 publish 校验。其他 drafts 集合及 direct 写入对全部支持语言执行完整性校验。配置 fallback 可以补足读取缺值，原始语言快照不写入 fallback 内容。任一被校验语言缺 required 且无有效 fallback 时拒绝生效。发布记录统一保存于 content_publications，不在文档行上另存发布指针。

复制读取并投影来源的全部语言，独立检查来源读取、复制和目标创建权限，允许用 `dataByLocale` 一次替换全部语言的唯一字段。历史恢复创建新的不可变修订，恢复整个原始语言快照，按实际差异检查写权限；唯一冲突或完整性失败不会部分恢复。

## 版本、关系与读取

drafts 保存只移动 current 指针；发布后继续编辑不会改变 published 读取。自动保存是可保留的真实修订，不能绕过草稿模式。direct 的每次有效保存同时移动 current 和 published；history:false 只保留仍活跃的修订。

DocumentView 显式输出 id、collection、revision、versionId、publishedVersionId、trashedAt、folderId、createdAt、updatedAt 和授权后的 data；publishedVersionId 对应请求语言的发布修订，不展开数据库内部行对象或其他语言的发布记录。文件只输出安全清单摘要及固定 binding 引用，不输出存储 object key。

列表和 total 共用授权 SQL 谓词。select、字段 read/query 策略、版本比较、关系目标和任务结果均按当前权限重新投影。历史详情接受 mode、locale、fallback、select 和 depth，字段策略得到相同的读取上下文。未知或不适用输入由严格 schema 拒绝。

关系展开按目标集合批量读取，反向 join 按定义及父文档批量查询，受节点、响应字节、SQL 数和深度预算约束。目标语言使用统一 `targetReadContext`：来源语言受目标支持时沿用，否则选择目标默认语言；未显式覆盖 fallback 时使用目标配置。显式 fallback 按目标支持语言过滤。

多态关系筛选在完整嵌套路径只存在于部分目标时，仅匹配这些合法目标；缺少路径的分支不匹配，所有目标均无完整路径时返回 `invalid_input`。存在路径但字段不可查询或值类型错误仍拒绝，目标 RBAC 和集合策略始终过滤目标。

关系路径负向筛选需要至少一条可读且完整的目标链；空引用、缺链或不可读目标不匹配，完整链的叶字段缺值可匹配负向。所有同名 block、group 及关系到达的合法分支统一聚合，不能分别否定后 OR；路径预检、实际 SQL 及目标策略展开均受配置预算约束。

归档是逻辑删除，取消仍待执行的发布计划，保留 current 唯一键直到 purge。关系删除策略分别执行 restrict、nullify 新修订和 cascade 逻辑归档，授权与图锁在同一事务内。purge 要求已归档、超过保留期限、无历史外部引用、无活动内容或资产工作，并原子释放修订媒体绑定和持久化行。

历史保留使用专用有界排名查询，不借用公开列表的页大小上限。current、published 和待执行任务固定修订始终受保护；保留数量与时间条件在全部历史上计算。

## 媒体固定引用

客户端只可提交已就绪 `uploadId`。消费时严格匹配 actor、集合、create/replace 用途和目标文档的预期 revision。不能以裸 manifestId 选择任意已有文件。

复制和恢复通过已授权的来源修订绑定取得运行时清单授权。upload、richText 媒体节点及 `$file` 都绑定确定清单；目标媒体后续替换或旧媒体修订被清理，不改变已有来源修订的固定字节。

离线 schema 回填只能复用原修订的同媒体身份和可映射位置；稳定字段重命名、子项身份及 localeMap 保持清单不变。转换 JSON 新增、替换媒体身份或移到无法映回的路径时拒绝整页，不创建缺少固定清单的引用。新增媒体字段采用可选 schema、受授权业务填充、再提高约束的过程。

私有下载先验证来源文档/修订/绑定归属，按绑定的实际语言重新执行来源 Where、原资产操作策略及当前字段投影，然后检查目标媒体当前文档读取与下载策略。历史下载额外要求历史读取权限。绑定 ID 不能跨文档、跨修订或跨隐藏语言借用。

重新处理在资产任务的有效 owner、generation 和租约事务内调用 `commitProcessing`。该参与者重新核验文档写策略和 revision，消费 ready replacement upload 并创建新内容修订；清单、文档指针、审计和任务结果一起提交。重放已完成任务只重新授权当前资源，不重新执行旧 revision 前置条件。

## 持久化任务与幂等

批量更新、复制、归档、恢复及定时发布保存发起 actor、原动作、预期 revision、固定修订、输入、逐项状态和真实结果引用。小批量走同一持久化 worker 后同步返回；大批量返回 jobId、当前状态和查询位置。统一 jobs 查询同时支持内容任务和注入的资产任务。

任务每次只领取一个，等待前项时不提前消耗后项租约。每个条目在业务事务开始时，以 owner、generation、running 且租约未过期为条件续租。事务使用不超过 requestTimeout 与 lease 的 deadline，结束前再次检查活租；业务变化、审计、逐项结果同事务提交。旧代次不能复制、发布或写入成功结果。

每个 tick 的领取和处理数量有配置上限。单项失败写入明确 error code；成功与失败混合为 partial。重试耗尽、取消和 worker 授权失败把未执行项写成终态，避免任务永久显示 queued。结果按当前来源动作、文档读取及 Where 过滤，统计只计算可见条目。

创建、复制、自动保存、历史恢复、purge、批量受理及发布计划的幂等记录只缓存资源/修订/job 引用。fingerprint 包含路径目标、集合、模式、语言和完整输入。重放重新授权并查询当前结果，不缓存旧字段 DTO，也不把已完成任务固定投影为 queued。

扩展 transform 在规范化后的请求语言快照上执行，返回值按同一补丁语义规范化；遗漏字段保留，显式 null 清除，数组/blocks 重排使用稳定 ID。扩展 validate 检查规范化后的全部语言。afterCommit 是持久化的至少一次任务，handler 接收稳定任务 id 和 AbortSignal，必须自行按 id 处理外部幂等并响应取消。仅显式 own-property 注册的函数可作为 handler，继承的 constructor/toString 不属于注册项。

## 验证装置

模块集成测试使用真实 PostgreSQL、RBAC、安全锁、审计和幂等记录；媒体边界使用实际本地存储与文件流。测试集合稳定 ID 使用 workflow 前缀，避免与应用生成迁移重合。

租约回归以应用门控和真实 PostgreSQL `pg_sleep` 验证：后项仍 queued/attempts=0，以及多项总耗时超过一次租约时仍按逐项续租成功。另覆盖租约被触发器失效后的业务/审计回滚、旧代次复制防重复、跨语言 binding 下载拒绝、隐藏嵌套字段保留与删除权限、原子多语言写入和全语言发布完整性。
