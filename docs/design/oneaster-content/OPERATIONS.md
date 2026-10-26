# 内容系统运行与恢复

运行入口、环境变量和预算分别以 `apps/api/package.json`、`bootstrap/load-config.ts`、`bootstrap/storage-config.ts` 与 [应用配置](APPLICATION.md) 为准。本文描述当前软件的运行步骤；本地构建和故障旅程不能证明线上月可用性、RTO 或 RPO。线上部署需单独授权。

## 拓扑与配置

至少两个独立 API 进程连接同一 PostgreSQL writer 与共享对象存储，负载均衡通过 `/readyz` 摘流。各节点使用同一发布版本、数据库 schema、语言消息合同和 `CMS_RATE_LIMIT_SECRET`。管理端与 client 均指向稳定入口，不能把节点本机文件夹作为多实例共享存储。

本版本包含大量 native 字段、索引与关联表；迁移和并行测试需要足够的 PostgreSQL 锁表容量。部署前核查 `SHOW max_locks_per_transaction`、`SHOW max_connections` 与实际迁移对象数，推荐将 `max_locks_per_transaction=1024` 配置在数据库实例并重启生效（本仓CI也在测试前显式配置、重启并核验1024）；同时核对数据库内存预算。默认 64 在多个迁移事务并行建表/清理时已实测触发 out of shared memory，不能把它当作可忽略的业务超时。迁移仍串行执行，并先在同配置隔离数据库验收。测试使用专用 `CMS_TEST_DATABASE_URL`，避免多套测试竞争同一个开发数据库的系统目录锁。

生产必须设置 `NODE_ENV=production`，PostgreSQL URL 必须包含唯一的 `sslmode=verify-full` 并使用受信任的证书。迁移身份通过 `CMS_MIGRATION_DATABASE_URL` 单独注入；运行身份通过 `DATABASE_URL` 注入，不能是 schema owner、superuser 或有越权角色继承的账号。运行账号由既有角色授权命令校验。

对象存储使用 `CMS_STORAGE_DRIVER=s3`、`CMS_S3_BUCKET`、`CMS_S3_REGION`，自定义 `CMS_S3_ENDPOINT` 在生产必须 HTTPS；仅在存储确实要求时设置 `CMS_S3_FORCE_PATH_STYLE=true`。凭据由 AWS SDK 的标准提供链注入，不写入业务文档、数据库内容或客户端。备份须覆盖对象版本和数据库中的 manifest/binding；只备份其中一方无法恢复完整公开媒体。

`CMS_FRONTEND_URL`、管理来源 `API_ALLOWED_ORIGINS` 和 `ONEASTER_CLIENT_ORIGIN` 使用实际 HTTPS origin；后者是预览唯一跳转目的地。`API_ALLOWED_HOSTS` 明确列出实际入口主机。反向代理处理连接来源与 Host，应用不信任客户端伪造的 X-Forwarded-For 来放宽限流。共享 PostgreSQL 限流使所有节点合计消耗同一身份的窗口额度。

client 构建和运行的 `ONEASTER_CONTENT_ORIGIN` 必须完全相同，指向新 CMS 稳定入口；更换来源须重建。`ONEASTER_API_ORIGIN` 指向同时提供 `/core/*` 与 `/oa/*` 的业务网关，文本 Studio 仍由真实 extensions 的 `/oa/api/studio/*` 管理运行与历史；不能把裸 Core 地址当作完整业务网关。`ONEASTER_LOGIN_ORIGIN`、登录代理凭据与会话加密配置独立注入。CMS 不保存供应商执行密钥，不把管理员会话提供给 client。移除旧 CMS 环境变量及路由配置。

## 初始化和启动

以下命令在已安装锁定依赖的完整仓库中执行，凭据由运行环境注入。密码使用命令的隐藏输入，不能写进命令历史。

1. 执行 `bun run lint`、`bun run typecheck`、`bun run build`、`bun run test`，并按发布影响运行 `bun run test:e2e e2e/public-content-ha.spec.ts`。构建验证内容生成物与配置一致。
2. 使用迁移身份执行 `bun run db:migrate`。该命令串行应用迁移、发布 schema 迁移与权限目录同步。不要由多个实例并发跑初始化，也不要手工跳过迁移 checksum。
3. 设置已有运行角色 `CMS_DATABASE_RUNTIME_ROLE`，执行 `bun run db:grant-runtime`。角色仅获得本版本的明确对象权限。
4. 执行 `bun run content:backfill --activate`，激活本次 native schema 映射。全新库也执行激活，不导入旧 CMS 数据。仅在真实已有 schema 升级时，按定义的 collection/from/to 与分页参数执行 backfill，并保存命令报告的 cursor，不能省略参数或假定任意历史版本可自动升级。
5. 以运行身份执行 `bun run admin:initialize --email <administrator-email>`，隐藏输入密码建立首次管理员，再执行 `bun run content:initialize --email <administrator-email>` 初始化 en/zh 软件语言与消息。后者幂等补缺失项，不覆盖编辑，也不生成首页或模型演示数据。
6. 使用 `node apps/api/dist/main.js` 启动每个 API。确认两个节点 `/readyz` 都返回 200 后接入负载均衡。管理端使用 `bun run start:admin`；client 按自身部署命令启动。
7. 管理员录入并发布 site、home、documents、developers 和 models。未发布内容应返回真实空状态或明确不可用；不要用演示内容掩盖初始化缺项。

首次管理员命令的参数与交互以 `bun run admin:initialize` 的当前实现为准。迁移、授权、回填命令完成后关闭高权限连接，常驻 API 不持有迁移凭据。

## 发布、摘流与故障

发布前确认迁移、运行权限、消息合同和对象存储准备完成。新节点先在负载均衡外启动并检查 readiness，再加入并逐步摘除旧节点。SIGTERM 停止接收新请求并清理任务、流和连接，应用硬退出期限为 10000 毫秒；进程管理器的终止宽限必须大于该期限。不能把仅能建立 TCP 连接当作 readiness。

节点故障时负载均衡停止向故障节点送新请求。不得自动重放非幂等管理写入或 Core 付费 POST；客户端提交意图保持不变，按原意图 lookup/状态读取恢复。CMS 普通读取单次有界，导出缺 end 帧即整体失败，消费端不能缓存或发布部分 sitemap。

数据库不可用时读取明确失败，不返回旧草稿或伪造空列表；恢复后由 readiness 检查决定是否重新接流。对象存储读取必须校验 pinned manifest 的摘要和长度，缺对象或不符时失败，不能改为直连任意上游 URL。预览退出需确认服务端撤销；CMS 暂时不可达时本地清 cookie 不等于服务器 grant 已撤销。

每个节点最多 64 个活动请求、10 个池连接。公开聚合、导出、媒体和管理各有独立期限及字节预算，具体见 APPLICATION 与 CONTRACTS。观测至少包括每操作状态/耗时、429/503/预算拒绝、池使用、活动流、导出中止、存储错误、事件循环和进程 RSS。日志不记录 grant、Cookie、供应商密钥、密码或完整生成输入。

## 回滚与恢复

保留已验证构建、数据库一致快照和对应对象版本。回滚构建前核对旧版本可接受的 schema、权限和消息合同；不恢复旧 CMS 路径或双读。存在不兼容迁移时停止写入、摘流，按已验证快照恢复数据库和对象绑定后，以匹配构建重新执行授权及 readiness 校验。不要反向执行未经定义的数据删除 SQL。

恢复验收包括管理员登录、已发布模型精确 modelId、草稿隔离、公开媒体 digest/HEAD/Range、完整 NDJSON end/digest，以及过期与撤销 grant 均拒绝。随后在一节点停止时重复公开读取，再重启并验证相同事实。备份保留时长、区域故障策略、恢复耗时和数据丢失窗口由实际部署与演练记录确定；本地双节点测试不替代这些部署证据。
