# New CMS

面向结构化内容、文件资料和 RBAC 管理的自研 CMS。后端采用 Hono、PostgreSQL 和 Drizzle；开发与脚本使用 Bun 1.4.4，生产使用 Node.js，测试使用 Vitest。

已实现后台账户与 RBAC 后端：邀请激活、邮箱密码登录、不透明会话、改密/重置、管理员、角色、权限、菜单、真实操作目录与接口绑定、审计及维护清理。使用三个私有工作区，提供34个管理操作、14张业务/平台表（另有迁移台账）、OpenAPI和Bun/Node网络测试。

内容/上传集合引擎及前端UI尚未实现，其完整目标保留在设计文档中。当前生产注册表只有已实现的后台操作，集合范围与菜单页面由调用方明确注入；应用尚未注册前端页面，不开放任意菜单URL或自建接口。

## 设计入口

- [架构决策基线](docs/design/architecture.md)：备选方案、模块、所有权、事务、文件一致性与高可用。
- [后端目录与代码组织](docs/design/code-organization.md)：文件归属、公开入口、查询/适配器、测试和人审路径。
- [功能和接口范围](docs/design/modules-and-contracts.md)：后端实施范围与主要行为约束。
- [后台账户与 RBAC 方案](docs/design/user-rbac-design.md)：账户及完整授权设计；配套[施工图](docs/design/user-rbac-implementation.md)和[字段、接口及测试矩阵](docs/design/user-rbac-units.md)。
- [Collections 与资源管理](docs/design/collections-and-assets.md)：完整能力目标、配置编译、集合级关系模型、上传型集合及版本资源一致性。
- [安全基线](docs/design/security-baseline.md)：入口、Node、Hono 和业务模块的责任。
- [近期研究证据](docs/design/research-evidence.md)：2026-07-25 至 2026-10-25 官方资料、源码快照及稳定原理。
- [本地 Payload 架构分析](docs/design/payload-architecture-analysis.md)：真实调用链、配置/权限/事务/文件边界及采纳取舍。
- [审查记录](docs/design/review-log.md)、[Tillgate 参考审计](docs/design/reference-audit.md)。
- [实施和验证计划](docs/design/implementation-plan.md)、[静态规则的实际边界](docs/design/lint-guardrails.md)。

## 本地运行

准备PostgreSQL数据库，复制.env.example为.env，填写DATABASE_URL及至少32字符的随机CMS_RATE_LIMIT_SECRET。生产数据库URL必须使用sslmode=verify-full，前端及允许来源必须为HTTPS；不要复用测试凭据。生产API使用真实Node.js，开发和命令使用Bun1.4.4。

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run operations:reconcile
bun run admin:initialize --email owner@example.com
bun run dev
```

初始化密码从终端隐藏输入，或从标准输入读取，不能放在命令行参数中。已有有效超管时初始化命令拒绝再次提权。构建后使用bun run start启动Node产物；迁移和操作目录核对由单独命令执行，API不会自动迁移或恢复管理员已解除的绑定。

新密码必须为15—128个Unicode字符、UTF-8不超过512字节，保留空格，不要求固定字符种类。初始化输入前显示要求；密码不合规时明确提示规则且不创建账户，已有超管或邮箱占用等错误分别说明原因，不输出密码或数据库详情。

缺少或非法环境配置时，启动日志列出需要修正的变量名并指向.env.example，不输出配置值。首次运行须先创建DATABASE_URL指定的数据库、准备.env，再按上述顺序迁移与核对目录；只有启动监听且/readyz返回200才表示服务就绪。

邮件配置使用SMTP_HOST、SMTP_PORT、SMTP_SECURE、SMTP_USER、SMTP_PASSWORD、SMTP_FROM及CMS_FRONTEND_URL；未配置SMTP时投递明确失败，账户创建仍返回实际状态。生产非直连TLS使用强制STARTTLS且验证证书。邀请/重置链接只在前端URL fragment携带令牌；令牌只存摘要，不保存可恢复邮件正文或自动重投，失败后需显式重新发起。

## 生产数据库权限

生产使用专用CMS数据库及无其他角色成员身份的LOGIN运行账号。DATABASE_URL只配置运行账号，CMS_MIGRATION_DATABASE_URL是迁移owner连接，仅提供给迁移、目录发布和权限配置命令；两种连接都必须验证TLS。CMS_DATABASE_RUNTIME_ROLE指定已由数据库管理员创建的运行角色，密码通过数据库管理工具交互设置，不放命令行。

运行角色必须为NOSUPERUSER、NOCREATEROLE、NOCREATEDB、NOREPLICATION、NOBYPASSRLS，不拥有数据库、业务schema、表或函数。发布步骤为：

```sh
bun run db:migrate
bun run operations:reconcile
bun run db:grant-runtime
bun run admin:initialize --email owner@example.com
```

db:grant-runtime验证并授予必要连接及业务CRUD权限，审计只允许SELECT/INSERT，操作目录与迁移台账只允许SELECT；拒绝额外权限、可执行SECURITY DEFINER或可写业务表上的definer触发器。已有PUBLIC/列授权等无法安全收窄时整体失败，由数据库管理员修正后重跑，不显示假成功。生产API和超管初始化会检查运行账号权限；开发/测试可用owner，迁移与目录发布始终使用迁移连接，开发/测试缺省回退DATABASE_URL。

审计迁移拦截UPDATE、DELETE、TRUNCATE；已应用迁移不改checksum，新保护通过0002追加。生产就绪检查要求该保护启用。迁移owner属于可信管理边界，不能把这些检查视为防恶意数据库管理员。保留数据库原有PUBLIC TEMP权限，连接明确将pg_temp放在业务schema之后，防止临时同名表遮蔽业务表。

GET/HEAD /livez只表示进程存活，不依赖数据库或共享限流；/readyz验证依赖与权限。访问日志记录真实响应操作、规范化路由模板及认证后的账户ID，不记录原始查询、资源参数值、令牌、密码或邮箱。

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

测试默认连接本机Unix socket的postgres数据库，并为普通测试建立随机隔离schema后清理；权限及受限角色旅程使用随机专用数据库/角色，测试连接需具备CREATEDB/CREATEROLE。其他环境必须设置CMS_TEST_DATABASE_URL；全部数据库测试都尊重该连接，CI使用独立PostgreSQL17服务，SMTP使用本地可编程TCP装置，不访问真实收件箱。测试命令显式覆盖迁移连接，避免继承部署连接。生产网络测试需要真实Node，可用CMS_NODE_BINARY明确指定；未找到时失败，不跳过。针对性旅程入口为bun run test:e2e e2e/user-rbac.spec.ts。

Husky由bun install时的prepare安装：pre-commit跑lint/typecheck，pre-push跑build/test，失败立即阻断。GitHub Actions对push/PR执行相同四门，固定Bun1.4.4、Node26.9.0和官方Action SHA，不部署。CI仅在安装时禁用本地hook，随后显式执行全部检查。

实现及验证细节见[后台账户/RBAC施工图](docs/design/user-rbac-implementation.md)。用户数据不在前端或HTTP handler中模拟；内容草稿/发布联合旅程、浏览器页面及部署演练属于对应后续阶段，不把当前身份/RBAC测试外推为这些能力已完成。
