# OneAster CMS

面向结构化内容、文件资料和 RBAC 管理的自研 CMS。后端采用 Hono、PostgreSQL 和 Drizzle；开发与脚本使用 Bun 1.4.4，生产使用 Node.js，测试使用 Vitest。

后端包括后台账户/RBAC、Collections 配置编译、文档/版本/发布/回收站、持久化批量及计划任务、上传型集合、图片处理与私有文件恢复。使用三个私有工作区，注册76个管理操作，提供 OpenAPI、真实 PostgreSQL 集成与 Bun/Node 网络测试。

应用配置启用 articles、pages、media 和 settings 集合。管理后台提供UI组件库、隔离组件工作台，以及真实登录、会话验证、账户概览和退出流程；账户/RBAC与内容资源界面按[应用联调方案](docs/design/admin-application-design.md)继续实施。不开放任意菜单 URL 或运行时建表。

## 设计入口

- [架构决策基线](docs/design/architecture.md)：备选方案、模块、所有权、事务、文件一致性与高可用。
- [后端目录与代码组织](docs/design/code-organization.md)：文件归属、公开入口、查询/适配器、测试和人审路径。
- [功能和接口范围](docs/design/modules-and-contracts.md)：后端实施范围与主要行为约束。
- [后台账户与 RBAC 方案](docs/design/user-rbac-design.md)：账户及完整授权设计；配套[施工图](docs/design/user-rbac-implementation.md)和[字段、接口及测试矩阵](docs/design/user-rbac-units.md)。
- [导航与管理契约修复](docs/design/navigation-contract-followup.md)：可信导航目录、DELETE版本提示、归档角色维护和兼容扩展的运行权限。
- [Collections 与资源管理](docs/design/collections-and-assets.md)：完整能力目标、配置编译、集合级关系模型、上传型集合及版本资源一致性。
- [Collections 后端方案](docs/design/collections-design.md)、[施工与验收](docs/design/collections-implementation.md)、[单元契约](docs/design/collections-units.md)及[资产实现](docs/design/assets-implementation.md)：当前外部契约、迁移回填与验证。
- [Collections UI 接口](docs/design/collections-ui-api-design.md)及[验证记录](docs/design/collections-ui-api-verification.md)：安全编辑布局、任务/上传发现、超管清理恢复与升级约束。
- [RBAC 恢复读取](docs/design/rbac-recovery-read-contract.md)及[施工与验证](docs/design/rbac-recovery-read-implementation.md)：普通读取权限或绑定失效时，活动超管通过安全分页取得恢复所需ID和CAS版本。
- [安全基线](docs/design/security-baseline.md)：入口、Node、Hono 和业务模块的责任。
- [近期研究证据](docs/design/research-evidence.md)：2026-07-25 至 2026-10-25 官方资料、源码快照及稳定原理。
- [本地 Payload 架构分析](docs/design/payload-architecture-analysis.md)：真实调用链、配置/权限/事务/文件边界及采纳取舍。
- [审查记录](docs/design/review-log.md)、[Tillgate 参考审计](docs/design/reference-audit.md)。
- [实施和验证计划](docs/design/implementation-plan.md)、[静态规则的实际边界](docs/design/lint-guardrails.md)。

## OneAster UI 工作台

前端位于apps/admin，通用组件位于packages/ui，使用Next.js App Router、React、Tailwind CSS、Base UI和实例化Zustand。品牌文字为OneAster，中英文及浅色/深色主题与Tillgate参考视觉一致。范围与验收见[UI设计](docs/design/admin-ui-design.md)、[组件映射](docs/design/admin-ui-components.md)、[施工图](docs/design/admin-ui-implementation.md)及[CMS组合契约](docs/design/admin-ui-cms-contracts.md)。

```sh
bun install --frozen-lockfile
bun run dev:admin
```

访问开发服务输出地址下的/ui，总览、七类组件页（/ui/actions、inputs、layout、feedback、data、overlays、documents）和/ui/lists组合列表均可直接访问或刷新。代码编辑引擎与worker在dev/build前从锁定的Monaco依赖生成到本地public目录，无需第三方CDN。工作台仅使用隔离合成示例，组件通过受控数据与事件验证，无需数据库或管理员凭据。构建后通过bun run start:admin启动Next服务。

根地址进入受保护的/dashboard，未登录时转到/login。先按下方步骤初始化并启动API，再启动Next；开发默认API为127.0.0.1:3001、后台为localhost:3000。Next服务端配置CMS_API_BASE_URL与CMS_ADMIN_ORIGIN，生产必须显式设置；非loopback地址必须为HTTPS，CMS_FRONTEND_URL与后台origin一致。配置不使用NEXT_PUBLIC。登录仅把后端Bearer保存在host-only HttpOnly Cookie，浏览器JSON及客户端状态不接收token。自动401和过期检查不改Cookie，避免迟到响应删除新登录；显式退出清浏览器身份，撤销失败如实提示。BFF不伪造转发IP，后端按实际出口IP限流，部署容量规划须计入聚合并发。

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
bun run content:generate --migration 0012_collection_change.sql
bun run db:migrate
bun run content:backfill --collection articles --from 1 --to 2 --page-size 20 --max-pages 100
```

回填逐页输出 processed、cursor、complete；页预算用尽返回退出码2，可带 --cursor 继续，也可从头按持久化标记重跑。旧 writer 停写后必须再次回填尾部，再执行 bun run content:backfill --activate；未排空时拒绝激活，新配置准备态不通过就绪检查。迁移命令仅装配数据库，不要求 SMTP/对象存储。新 schema 开始写入后的回滚需要明确逆向转换或前向修复。失败对象清理由 bun run assets:reconcile 显式重试有界批次，失败账本不会伪报删除成功。

0011_ui_api.sql 增加清理代次和发现索引。旧 API 维护循环及旧 CLI 清理执行者必须先停止并排空，再启动新版清理和 HTTP 重试；新旧清理协议不能混跑。回滚同样先停止并排空新版清理，再恢复旧产物，保留扩展结构。完整步骤见[接口升级约束](docs/design/collections-ui-api-design.md#5-预算迁移和发布)。三个新集合操作需显式配置权限绑定；三个物理清理操作仅活动超管可用。

人工迁移报告不会自动放行。完成 SQL 审查后可在生成命令增加 --reviewed-sql 文件路径；输入文件放在自动扫描 migrations 目录以外，生成器把正文与快照固化到同名 .plan.json，并附加到目标 SQL。集合 API key 重命名还须显式处理权限范围、绑定及在途任务；该选项不执行迁移、不证明人工 SQL 正确，也不跳过 schema 就绪和激活校验。

## 导航与管理接口

CMS_NAVIGATION_PATHS和CMS_NAVIGATION_ICONS是逗号分隔的可信前端路径及图标名目录，默认均为空。路径必须是规范的站内绝对路径，不含查询、fragment、反斜杠或控制字符；图标名以英文字母开头，后续仅允许字母、数字、下划线和连字符；两类目录都不接受重复项。前端接入后只填写实际存在的页面及图标，修改后重启API。UI工作台属于公开合成示例，未作为业务菜单注册，因此示例配置保持为空。

未注册任何页面时，group可创建，合法page请求返回503 temporarily_unavailable，path字段说明尚无已注册页面；page缺少path仍返回400。目录非空时，未知path或非null未知icon返回400及对应字段提示；icon可使用null。action必须挂在page下。撤除路径后，相关page及其action不再出现在/me/navigation，空group同时隐藏，管理树保留记录以便修正。

采用version并发控制的DELETE管理接口使用必填查询参数version，例如DELETE /v1/roles/:id?version=3；JSON body不被读取。缺失、非法或重复version返回400 invalid_input，并在fieldErrors.version明确提示使用单一正整数查询参数。PATCH/PUT的version仍放在JSON中。内容归档和取消发布使用revision查询参数，取消发布计划及上传会话按各自输入契约，不强制version。

归档账号保留邮箱与角色引用，不能恢复状态或硬删除。超管可通过PATCH /v1/admins/:id维护其displayName或迁至另一active角色，迁移不会恢复账号。角色的adminCount包含归档账号；仍有引用时删除返回409 resource_in_use并提示停用角色或显式迁移关联账号，完成迁移后才可删除无引用的旧角色。

## 生产数据库权限

生产使用专用CMS数据库及无其他角色成员身份的LOGIN运行账号。DATABASE_URL只配置运行账号，CMS_MIGRATION_DATABASE_URL是迁移owner连接，仅提供给迁移、目录发布、schema回填/激活和权限配置命令；两种连接都必须验证TLS。CMS_DATABASE_RUNTIME_ROLE指定已由数据库管理员创建的运行角色，密码通过数据库管理工具交互设置，不放命令行。

运行角色必须为NOSUPERUSER、NOCREATEROLE、NOCREATEDB、NOREPLICATION、NOBYPASSRLS，不拥有数据库、业务schema、表或函数。发布步骤为：

```sh
bun run db:migrate
bun run operations:reconcile
bun run db:grant-runtime
bun run admin:initialize --email owner@example.com
```

db:grant-runtime按固定表策略和当前编译映射的精确表名验证并授予必要连接及业务权限，五张schema控制/版本/清单/回填表仅SELECT，审计只允许SELECT/INSERT，操作目录与迁移台账只允许SELECT；拒绝额外权限、可执行SECURITY DEFINER或可写业务表上的definer触发器。已有PUBLIC/列授权等无法安全收窄时整体失败，由数据库管理员修正后重跑，不显示假成功。生产API和超管初始化会检查运行账号权限；开发/测试可用owner，迁移与目录发布始终使用迁移连接，开发/测试缺省回退DATABASE_URL。

就绪检查要求本产物必需表全部存在且权限精确匹配；新增表或视图只有对当前运行账号没有任何有效表、列或GRANT权限时才允许存在，包含经PUBLIC取得的权限。db:grant-runtime只向本产物明确列出的表授权，不向未知表自动授权。

有结构扩展的滚动发布使用每版本独立运行账号：先执行兼容扩展迁移，保持旧账号无新增对象权限；用新产物及其CMS_DATABASE_RUNTIME_ROLE为新账号配置权限，再以新账号启动新实例。观察新旧实例的/readyz、请求错误及任务排空情况，滚动窗口内不改变旧账号权限。回滚同时恢复旧产物和旧DATABASE_URL，保留扩展结构；schemaVersion切换还需遵守Collections的准备、尾回填、激活协议；产生新schema写入后不能直接退回旧schema。旧实例、请求及任务排空且约定回滚窗口结束后才退役旧账号，破坏性结构删除另走后续迁移。新增危险PUBLIC授权或definer能力不属于兼容扩展。

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

lint包含工作区、HTTP/业务依赖和schema owner导入约束及类型感知Oxlint；typecheck使用bun check检查后端、UI包和Next应用；build构建Node API、命令、SQL迁移、规范插件及Next生产产物；test运行Vitest/Istanbul、React交互测试、真实PostgreSQL集成、Bun/Node网络旅程及开发/生产浏览器冒烟。覆盖率包含全部本期手写业务代码及原插件范围，门槛为statements/functions/lines90%、branches85%，不排除入口或SQL适配器。

测试默认连接本机Unix socket的postgres数据库，并为普通测试建立随机隔离schema后清理；权限及受限角色旅程使用随机专用数据库/角色，连接需具备CREATEDB/CREATEROLE。其他环境设置CMS_TEST_DATABASE_URL；所有数据库装置尊重该连接并显式隔离迁移连接，不使用部署凭据。CI使用PostgreSQL17，SMTP/S3使用本地可编程装置，不访问真实收件箱或云账号。网络测试使用真实Bun与Node（可用CMS_NODE_BINARY指定），缺失运行时直接失败。针对性入口为bun run test:e2e e2e/collections.spec.ts或e2e/assets.spec.ts；完整test执行账户、内容和媒体三组共6条旅程，并运行开发/生产浏览器旅程。浏览器入口为bun run test:e2e e2e/admin-ui.browser.spec.ts，可追加--project production或--grep。首次运行执行bun --bun node_modules/@playwright/test/cli.js install chromium；CI安装浏览器及系统依赖。

Husky由bun install时的prepare安装：pre-commit跑lint/typecheck，pre-push跑build/test，失败立即阻断。GitHub Actions对push/PR执行相同四门，固定Bun1.4.4、Node26.9.0和官方Action SHA，不部署。CI仅在安装时禁用本地hook，随后显式执行全部检查。

各批实际门禁数字见对应施工与验收记录。真实云存储账号、容量压测、多故障域故障切换及 PITR 部署演练未执行；这些属于部署验收阶段，不以本地门禁代替基础设施可用性验收。
