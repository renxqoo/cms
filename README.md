# New CMS

面向结构化内容、文件资料和 RBAC 管理的自研 CMS。后端采用 Hono、PostgreSQL 和 Drizzle；开发与脚本使用 Bun 1.4.4，生产使用 Node.js，测试使用 Vitest。

后端包括后台账户/RBAC、Collections 配置编译、文档/版本/发布/回收站、持久化批量及计划任务、上传型集合、图片处理与私有文件恢复。使用三个私有工作区，注册69个管理操作，提供 OpenAPI、真实 PostgreSQL 集成与 Bun/Node 网络测试。

应用配置启用 articles、pages、media 和 settings 集合。前端 UI 属于后续阶段；尚未注册前端页面，不开放任意菜单 URL 或运行时建表。

## 设计入口

- [架构决策基线](docs/design/architecture.md)：备选方案、模块、所有权、事务、文件一致性与高可用。
- [后端目录与代码组织](docs/design/code-organization.md)：文件归属、公开入口、查询/适配器、测试和人审路径。
- [功能和接口范围](docs/design/modules-and-contracts.md)：后端实施范围与主要行为约束。
- [后台账户与 RBAC 方案](docs/design/user-rbac-design.md)：账户及完整授权设计；配套[施工图](docs/design/user-rbac-implementation.md)和[字段、接口及测试矩阵](docs/design/user-rbac-units.md)。
- [Collections 与资源管理](docs/design/collections-and-assets.md)：完整能力目标、配置编译、集合级关系模型、上传型集合及版本资源一致性。
- [Collections 后端方案](docs/design/collections-design.md)、[施工与验收](docs/design/collections-implementation.md)、[单元契约](docs/design/collections-units.md)及[资产实现](docs/design/assets-implementation.md)：当前外部契约、迁移回填与验证。
- [安全基线](docs/design/security-baseline.md)：入口、Node、Hono 和业务模块的责任。
- [近期研究证据](docs/design/research-evidence.md)：2026-07-25 至 2026-10-25 官方资料、源码快照及稳定原理。
- [本地 Payload 架构分析](docs/design/payload-architecture-analysis.md)：真实调用链、配置/权限/事务/文件边界及采纳取舍。
- [审查记录](docs/design/review-log.md)、[Tillgate 参考审计](docs/design/reference-audit.md)。
- [实施和验证计划](docs/design/implementation-plan.md)、[静态规则的实际边界](docs/design/lint-guardrails.md)。

## 本地运行

准备PostgreSQL数据库，复制.env.example为.env，填写DATABASE_URL及至少32字符的随机CMS_RATE_LIMIT_SECRET。生产数据库URL必须使用sslmode=verify-full，前端及允许来源必须为HTTPS；不要复用测试凭据。生产API使用真实Node.js，开发和命令使用Bun1.4.4。

```sh
bun install --frozen-lockfile
bun run content:check
bun run db:migrate
bun run operations:reconcile
bun run admin:initialize --email owner@example.com
bun run dev
```

初始化密码从终端隐藏输入，或从标准输入读取，不能放在命令行参数中。已有有效超管时初始化命令拒绝再次提权。构建后使用bun run start启动Node产物；迁移和操作目录核对由单独命令执行，API不会自动迁移或恢复管理员已解除的绑定。

新密码必须为15—128个Unicode字符、UTF-8不超过512字节，保留空格，不要求固定字符种类。初始化输入前显示要求；密码不合规时明确提示规则且不创建账户，已有超管或邮箱占用等错误分别说明原因，不输出密码或数据库详情。

缺少或非法环境配置时，启动日志列出需要修正的变量名并指向.env.example，不输出配置值。首次运行须先创建DATABASE_URL指定的数据库、准备.env，再按上述顺序迁移与核对目录；只有启动监听且/readyz返回200才表示服务就绪。

邮件配置使用SMTP_HOST、SMTP_PORT、SMTP_SECURE、SMTP_USER、SMTP_PASSWORD、SMTP_FROM及CMS_FRONTEND_URL；未配置SMTP时投递明确失败，账户创建仍返回实际状态。生产非直连TLS使用强制STARTTLS且验证证书。邀请/重置链接只在前端URL fragment携带令牌；令牌只存摘要，不保存可恢复邮件正文或自动重投，失败后需显式重新发起。

未配置 S3 时自动使用私有本地存储，production 同样适用；CMS_STORAGE_ROOT 默认 .data/assets，目录权限为0700。设置 CMS_S3_BUCKET 和 CMS_S3_REGION 后自动选择 S3，可用 CMS_STORAGE_DRIVER 显式选择 local 或 s3；部分或非法 S3 配置明确报错。可选 HTTPS CMS_S3_ENDPOINT 及 CMS_S3_FORCE_PATH_STYLE。多实例本地存储须共用同一持久化共享卷。切换 driver 前须完成已有对象的同键搬迁和摘要核对，配置切换不会自动搬迁字节。凭据沿用 AWS SDK 标准链，不写入集合或文档。CMS_MAINTENANCE_INTERVAL_MS 控制同一有界维护循环，默认60000毫秒。上传经授权 API 代理，媒体下载逐次检查来源文档、字段与目标权限，无公开静态目录。

修改 apps/api/src/config/collections 后运行 bun run content:generate；物理或 schema 注册变化必须指定新的 --migration 迁移文件名。SQL 与同名 .plan.json 快照一同审查提交，已有迁移不能覆盖；API 不执行 DDL。需要显式转换时，保留 previousSchemas 与版本化 migrations，按[演进协议](docs/design/collections-design.md#10-后续-schema-演进与发布完整性)先应用准备迁移，再有界回填：

```sh
bun run content:generate --migration 0011_collection_change.sql
bun run db:migrate
bun run content:backfill --collection articles --from 1 --to 2 --page-size 20 --max-pages 100
```

回填逐页输出 processed、cursor、complete；页预算用尽返回退出码2，可带 --cursor 继续，也可从头按持久化标记重跑。旧 writer 停写后必须再次回填尾部，再执行 bun run content:backfill --activate；未排空时拒绝激活，新配置准备态不通过就绪检查。迁移命令仅装配数据库，不要求 SMTP/对象存储。新 schema 开始写入后的回滚需要明确逆向转换或前向修复。失败对象清理由 bun run assets:reconcile 显式重试有界批次，失败账本不会伪报删除成功。

人工迁移报告不会自动放行。完成 SQL 审查后可在生成命令增加 --reviewed-sql 文件路径；输入文件放在自动扫描 migrations 目录以外，生成器把正文与快照固化到同名 .plan.json，并附加到目标 SQL。集合 API key 重命名还须显式处理权限范围、绑定及在途任务；该选项不执行迁移、不证明人工 SQL 正确，也不跳过 schema 就绪和激活校验。

## 验证和提交门禁

使用 Bun 1.4.4 安装并运行：

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
bun run test
```

lint包含工作区、HTTP/业务依赖和schema owner导入约束及类型感知Oxlint；typecheck使用用户确认的bun check；build构建Node API、命令、SQL迁移及规范插件；test运行Vitest/Istanbul、真实PostgreSQL集成及Bun/Node网络旅程。覆盖率包含全部本期手写业务代码及原插件范围，门槛为statements/functions/lines90%、branches85%，不排除入口或SQL适配器。

测试默认连接本机Unix socket的postgres数据库，并为每次测试建立随机隔离schema后清理。其他环境必须设置CMS_TEST_DATABASE_URL；CI使用独立PostgreSQL17服务，SMTP/S3使用本地可编程装置，不访问真实收件箱或云账号。生产网络测试需要真实Node，可用CMS_NODE_BINARY明确指定；未找到时失败，不跳过。针对性入口为bun run test:e2e e2e/collections.spec.ts或e2e/assets.spec.ts；完整test同时执行账户、内容及媒体三组Bun/Node旅程。

Husky由bun install时的prepare安装：pre-commit跑lint/typecheck，pre-push跑build/test，失败立即阻断。GitHub Actions对push/PR执行相同四门，固定Bun1.4.4、Node26.9.0和官方Action SHA，不部署。CI仅在安装时禁用本地hook，随后显式执行全部检查。

各批实际门禁数字见对应施工与验收记录。浏览器页面、真实云存储账号、容量压测、多故障域故障切换及 PITR 部署演练未执行；这些属于前端及发布阶段，不以本地门禁代替基础设施可用性验收。
