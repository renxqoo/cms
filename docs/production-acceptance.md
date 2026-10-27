# 内容与资源 CMS 部署验收手册

本手册针对单组织、配置驱动的内容与资源 CMS。租户归属及隔离由消费业务系统实现；管理 API 不接收业务侧伪造的租户或管理员身份。AI 模型、Skill、提示词等业务集合在真实接入时定义和迁移，本手册不表示这些业务页面已经实现。

## 内容消费边界

现有 `CollectionDefinition` 支持本地化文本、富文本、查询索引、唯一字段和集合关系，可承载后续模型详情、Skill 与提示词。业务接入时用实际字段配置标题、描述、slug、正文、SEO 元数据及媒体引用，不为每个内容类型再建一套编辑器或上传链。共享资料与翻译字段分别配置；同一文档 ID 保持跨语言身份，默认语言使用服务端 `defaultLocale`。

本地化唯一字段的预约包含 locale，不能假设 slug 跨语言全局唯一；业务路由应显式包含语言，并在真实配置中确定 slug 的字符、长度和规范化规则。SEO 标题、描述及图片属于内容数据，业务站点输出可抓取的 HTML、语言标签、canonical、hreflang、sitemap 和结构化数据；slug 更改后的重定向也由业务路由负责，不把 CMS 编辑地址当公开内容 URL。

业务交付只消费授权范围内的已发布快照，显式选择语言和 fallback；缺失翻译、未发布语言及下架内容不得通过默认回退误判为已上线。需要各语言独立发布时，使用既有 `localizeStatus` 配置并遵守 schema 演进协议。消费身份、公开接口和缓存失效在实际业务接入时定义，不能把管理员会话放入公开前端，也不能把管理 API 解除授权当作内容交付实现。

## 1. 发布物与可复现检查

在独立发布目录检出明确 Git 提交，使用锁定依赖和 Bun 1.4.4。生产 API 与 Next 使用真实 Node；仓库 CI 当前验证 Node 26.9.0。禁止把开发运行目录、测试数据库或未提交工作区直接作为发布物。

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
bun run test
```

测试的 `CMS_TEST_DATABASE_URL` 必须指向可删除的独立测试库，不能使用 `DATABASE_URL` 的业务库。测试会创建随机 schema、数据库及角色，测试账号需要相应权限。完整测试包括覆盖率、真实 PostgreSQL、Bun/Node API 和开发/生产 Next 浏览器。通过不等于生产 TLS、SMTP、云存储、备份或容量已经验收。

记录提交 SHA、锁文件、运行时版本、四门退出码、实际测试数与覆盖率。部署同一份 `apps/api/dist`、Next `.next`、`public`、锁文件及其依赖，不在各实例重新构建不同产物。不要把 `.env`、浏览器状态、测试文件、覆盖率或备份打进公开静态目录。

## 2. 环境与提供方配置

由进程管理平台分别向 API、前端和发布命令注入环境变量。Node 入口不负责加载 shell 配置；不要假设启动 Node 会自动读取工作区 `.env`。配置定义在 `apps/api/src/bootstrap/load-config.ts`、`storage-config.ts` 和 `apps/admin/src/server/config.ts`，以这些定义为准。

| 归属 | 必需配置与核验 |
| --- | --- |
| API | `NODE_ENV=production`；`DATABASE_URL` 为专用运行账号且 `sslmode=verify-full`；`DATABASE_SCHEMA` 指向实际业务 schema |
| 发布命令 | 独立的 `CMS_MIGRATION_DATABASE_URL`、`CMS_DATABASE_RUNTIME_ROLE`；迁移 owner 凭据不注入在线 API 或 Next |
| 入口 | `API_HOST`、`API_PORT`、`API_ALLOWED_HOSTS` 与真实反代一致；仅受信入口可访问 API；`API_ALLOWED_ORIGINS` 只列批准的 HTTPS 管理端来源 |
| 前端 | `CMS_API_BASE_URL` 为真实 API origin；非 loopback 使用 HTTPS；`CMS_ADMIN_ORIGIN` 与用户访问的唯一 HTTPS origin 完全一致 |
| 身份链接 | `CMS_FRONTEND_URL` 与管理端 origin 一致；`CMS_RATE_LIMIT_SECRET` 至少 32 字符，所有实例一致，通过机密管理注入 |
| SMTP | `SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM` 使用真实提供方；证书验证开启，非直连 TLS 使用强制 STARTTLS |
| 文件 | 本地驱动使用持久化 `CMS_STORAGE_ROOT`，0700，非网站静态目录；多个实例必须共享同一持久卷。S3 使用已定义的 bucket/region/endpoint 配置和 SDK 凭据链 |
| 导航 | `CMS_NAVIGATION_PATHS`、`CMS_NAVIGATION_ICONS` 只包含真实受支持目录；可从根 `.env.example` 核对，不开放任意 URL |

反向代理负责 TLS、请求大小、连接及入口限流；身份和管理响应不得共享缓存。保留原始 `Origin`，不要伪造转发 IP 来绕过聚合出口限流。私有文件继续经认证 BFF，存储桶和本地目录不提供公开列举或静态下载。

## 3. 首次上线与升级

数据库管理员先创建独立数据库、迁移 owner 和无超级权限、无所有权及无额外角色成员身份的运行角色。机密通过交互或平台注入，不放命令行参数。在线实例启动前在发布环境执行：

```sh
bun run content:check
bun run db:migrate
bun run operations:reconcile
bun run db:grant-runtime
bun run admin:initialize --email owner@example.com
```

最后一行仅用于首次初始化，邮箱替换为实际负责人，通过隐藏终端输入密码。已有有效超管时不可重新初始化。迁移与首次目录配置的真实语义见 README；升级不会自动恢复管理员主动解除的绑定。

由进程管理平台分别启动 `bun run start` 和 `bun run start:admin`，注入相应生产配置并设置明确的 Next 监听地址/端口。API 的优雅排空上限为 10 秒，平台终止期限须额外覆盖摘流与连接关闭时间。API 进程同时承担有界维护及资产处理，不另启动未经配置的并行清理程序。

启动后访问 API `/livez` 与 `/readyz`，分别确认进程存活和依赖/权限就绪；两者不能互换。反代健康检查必须使用真实 API Host。Next 验收登录页、认证后深层页面刷新和 BFF 真实请求，不以静态首页 200 代称就绪。部署平台只有在这些检查通过后才接入流量。

升级包含表扩展时，遵守 README 的每版本独立运行账号流程；新增 schemaVersion 遵守准备迁移、停旧写、尾回填和显式激活。清理代次迁移要求先停止并排空旧清理执行者。回滚前确认是否已经产生新 schema 写入；有存量转换时必须采用明确逆向转换或前向修复，不能只切旧二进制。

## 4. 目标环境功能验收

仅使用可删除的专用验收内容和受控邮箱。保存实际请求/任务身份、脱敏日志、时间和终态，不能把 202 记录为完成。

| 旅程 | 必须核实的终态 |
| --- | --- |
| 身份 | 登录、退出、密码恢复、邀请接受；HTTPS 下 host-only HttpOnly Secure 会话；令牌不出现在日志或查询字符串 |
| 授权 | 普通编辑角色读取、允许写入和拒绝写入；撤权后刷新/重试拒绝；不可读字段不出现在列表、结构、版本或关系选项中 |
| 内容 | 新建、手动/自动保存、发布、修改草稿、线上快照保持原内容、取消发布；冲突保留草稿 |
| 多语言 | 每种支持语言独立编辑，编辑不复制 fallback；缺失翻译的展示由消费业务显式决定；复制和历史恢复覆盖所有语言 |
| 整理与恢复 | 文件夹移动、跨页选择、切范围清选择、批量逐项结果、归档、回收站恢复及引用/保留保护 |
| 资源 | 真实 PNG/PDF 字节上传、取消、替换、图片处理；已发布和历史版本仍取得原字节；无权用户不能取得私有文件 |
| 任务 | 刷新或重启后发现计划/批量/处理任务，取消和撤权生效，失败原因可见；清理重试只报告实际状态 |
| 界面 | 桌面及 390px 窄屏，中英文、键盘焦点、弹窗关闭/恢复焦点及离站保护；正文及表格内容可访问完整内容 |

本地可重复对应浏览器旅程：

```sh
bun run test:e2e e2e/admin-content-workflow.browser.spec.ts e2e/admin-content.browser.spec.ts e2e/admin-content-editor.browser.spec.ts e2e/admin-content-sidebar.browser.spec.ts e2e/admin-content-folders.browser.spec.ts e2e/admin-content-copy.browser.spec.ts
bun run test:e2e e2e/admin-assets.browser.spec.ts e2e/admin-images.browser.spec.ts e2e/admin-article-media.browser.spec.ts e2e/admin-upload-recovery.browser.spec.ts e2e/admin-jobs.browser.spec.ts e2e/admin-job-uploads.browser.spec.ts e2e/admin-job-access.browser.spec.ts e2e/admin-asset-cleanups.browser.spec.ts
```

## 5. 一致备份与恢复演练

数据库与私有对象必须组成同一个恢复点。以下是有计划停写的可复现演练，不代表在线 PITR 或零数据损失承诺。先停止所有写入入口、API/维护执行者及文件处理，核实排空且没有外部存储写入，再取得数据库与文件副本；整个快照期间保持停写。S3 使用提供方的版本及恢复工具取得同一恢复窗口内完整对象集；没有选定提供方时不能假设一个通用复制命令能恢复删除的历史版本。

PostgreSQL 客户端使用与服务端兼容的主版本。由运维在受保护的 libpq service 配置中定义 `cms_backup` 和 `cms_restore`，前者为源备份连接，后者为新建的隔离恢复库及迁移 owner；验证 TLS，不在命令中暴露密码。单库 pg_dump 不包含集群角色；恢复到新集群时，DBA 还须按第 3 节约束创建恢复专用 LOGIN 运行角色，以新的凭据配置 `DATABASE_URL` 和 `CMS_DATABASE_RUNTIME_ROLE`，再执行授权。演练不复用生产数据库账号密码。恢复库、恢复卷和外发邮件必须与业务隔离。

下面的 `cms_snapshot_dir` 是本次新建备份目录，执行前明确赋值；`CMS_STORAGE_ROOT` 必须为实际本地持久卷的绝对路径。本地驱动演练命令：

```sh
umask 077
mkdir -m 700 "$cms_snapshot_dir"
PGSERVICE=cms_backup pg_dump --format=custom --file="$cms_snapshot_dir/database.dump"
tar -C "$CMS_STORAGE_ROOT" -cpf "$cms_snapshot_dir/assets.tar" .
openssl dgst -sha256 "$cms_snapshot_dir/database.dump" "$cms_snapshot_dir/assets.tar" > "$cms_snapshot_dir/SHA256SUMS"
```

确认两个备份成功、记录停写起止时间和对应发布提交，再按平台流程恢复服务。备份采用加密存储、独立权限及异地保留。记录数据库角色配置及提供方的非机密恢复参数，凭据单独由机密系统恢复。

在全新空库和空卷恢复，不覆盖现行业务。数据库恢复由迁移 owner 执行：

```sh
PGSERVICE=cms_restore pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname=service=cms_restore "$cms_snapshot_dir/database.dump"
```

文件恢复必须以目标 API 的操作系统用户执行，先将备份通过受控方式提供给该用户读取，再执行以下命令。目标目录及每个对象必须由目标 API 的 UID/GID 拥有，祖先目录必须符合本地存储的可信所有权和不可被其他身份写入规则；仅 chmod 0700 不足以修复所有权。跨机器恢复不保留源主机的 UID/GID：

```sh
umask 077
mkdir -m 700 "$cms_restore_storage_root"
tar --no-same-owner -C "$cms_restore_storage_root" -xpf "$cms_snapshot_dir/assets.tar"
```

`cms_restore_storage_root` 必须为新卷的绝对路径，恢复实例的 `CMS_STORAGE_ROOT` 指向它。恢复与备份时相同的提交及集合配置；数据库与账号配置全部改为恢复环境。首次启动前离线核对备份摘要、恢复表和对象清单，SMTP 使用受控接收环境，随后重新执行 `db:grant-runtime` 验证精确权限。启动会恢复正常任务处理，到期计划及清理可能立即执行，不能假定存在暂停所有任务的配置。通过 `/readyz` 后验收普通角色读取、发布快照、多语言、固定历史文件的 SHA-256 和任务账本，区分恢复点状态与恢复后合法执行的任务结果。

演练必须记录备份恢复点、实际数据缺口、开始/结束时间、恢复后的抽查身份及文件摘要，计算实测 RPO/RTO。在线 PITR 需要 WAL 归档与数据库基础备份，私有对象保留期必须覆盖整个恢复窗口；配置和演练完成后才可承诺相应恢复目标。依据为 PostgreSQL 官方的[备份方法](https://www.postgresql.org/docs/17/backup.html)、[pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)及[pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)。

## 6. 容量、监控与放行

部署前记录管理员数、内容与版本量、语言数、文件体积与数量、峰值读写/上传并发及可接受延迟。以真实字段、关系和权限分布生成隔离数据，逐级增加负载，覆盖普通读取、发布、撤权、上传/下载及积压恢复。记录吞吐、p95/p99、429/503、锁等待、数据库连接、CPU、内存和对象请求；超过预算时必须能恢复容量，不通过调高限流或去掉权限检查换吞吐。

当前每 API 实例数据库池上限 10、请求并发 64、上传请求 60 秒、普通请求 15 秒、SQL 5 秒、锁等待 2 秒；密码并发 4、等待队列 8。每个用户默认每分钟 60 次、出口 IP 默认每分钟 120 次，所有实例共享计数；BFF 聚合出口应纳入容量验收。总连接预算包括滚动窗口、维护、发布命令、监控和管理余量，不能按单实例上限乘实例数后忽略数据库总量。

监控至少包含就绪、请求错误与耗时、登录失败/异常撤权、任务积压/终态失败、上传失败、清理阻塞、存储容量和备份恢复演练结果。日志以 requestId/operationId/规范路由关联，不记录凭据、正文、原始查询或私有对象键。告警接收人、阈值与升级路径由运维在目标环境配置并触发一次实测。

放行记录由负责人填写：提交与产物、工程门禁、功能旅程、权限矩阵、实际提供方、备份恢复证据、容量测量、故障演练、回滚条件和授权部署记录。未测量的 SLA、PITR、故障切换及容量保持未验收。现阶段交付可复现方案；目标环境选定后按本手册执行并附真实证据。
