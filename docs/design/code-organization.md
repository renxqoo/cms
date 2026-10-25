# 后端目录与代码组织约定

状态：本项目后端的目录设计，2026-10-25。identity/access、database、平台与审计及对应HTTP/命令已实现；内容/资源等未实施目录仍为目标，不创建占位业务文件或空驱动。

本次影响面：目录、公开导出、配置编译、查询与事务参与能力、上传型集合、后台工作和测试归属。内容/资源目标遵循完整能力设计；不实施业务接口、数据库迁移或前端。

## 1. 工作区与运行入口

```text
apps/api/
  src/
    main.ts                         Node HTTP 进程入口
    worker.ts                       后台消费者进程入口
    bootstrap/
      load-config.ts                读取及校验环境配置
      create-runtime.ts             实例化连接、适配器和业务模块
      shutdown.ts                   摘流、有限排空与关闭资源
    config/collections/             本部署启用的内容集合
    commands/
      generate-content.ts           生成内容类型、存储映射和 schema
      migrate.ts                    一次性迁移入口
      initialize-admin.ts           离线初始化超管入口
      reconcile-operations.ts       发布时核对操作目录
    adapters/
      storage/                      实际采用的对象存储/开发本地驱动
      mail/                         实际采用的邮件提供方
      password/                     Node 兼容密码哈希实现
    http/
      create-app.ts                 创建 Hono 应用，接收已装配业务能力
      errors.ts                     业务失败到 HTTP 的明确映射
      identity/                     登录、会话及身份协议
      access/                       管理员、角色、权限、菜单、接口协议
      content/                      集合、文档、发布、版本协议
      assets/                       上传会话、文件处理和读取协议，调用 content 编排
      audit/                        审计查询协议
      middleware/                   官方及本项目中间件的配置/组合
      openapi/                      操作注册、文档与目录投影构建
packages/cms/
  src/
    identity/
    access/
    content/
    assets/
    audit/
    platform/
      idempotency/
      rate-limits/
      security-lock/
packages/database/
  src/
    client.ts                       连接工厂及内部事务类型
    migrate.ts                      迁移执行能力
    codegen/                        物理计划类型与 schema 生成
    schema/
      identity.ts
      access.ts
      content.ts
      assets.ts
      audit.ts
      platform.ts
      generated/                    生成的集合/修订/子表/关系
  migrations/                       唯一版本化迁移链
  drizzle.config.ts                 数据库工具配置
test/support/                       公共 PostgreSQL、HTTP、存储及邮件测试装置
e2e/                                Bun 开发与真实 Node 产物的跨进程旅程
tooling/                            规范及架构检查
docs/design/                        设计、契约和证据
```

main.ts、worker.ts 和 commands 是分别启动的入口，复用 create-runtime 的必要装配能力，入口文件不被其他入口或业务 import。HTTP 不隐式启动消费者，worker 不开启 HTTP 业务端口；导入装配函数不启动进程活动。是否部署独立 worker 由队列与资源负载决定，同一代码产物支持不同进程入口。

bootstrap 只处理配置和生命周期，不执行发布文档、授权替换等业务。commands 负责解析命令输入、装配、调用既定能力和退出，不复制业务规则。迁移及操作目录核对通过一次性发布任务执行，不由各 API 实例并发修改数据库结构。

配置按入口真正使用的依赖验证，共用配置字段保持单一来源。迁移命令只创建数据库资源，不因复用装配而被迫创建 SMTP、对象存储或 Hono 应用；每个入口仅负责关闭自己创建的资源。

目录属于归属约定，不是要求在第一个切片生成整棵树。每个入口、适配器和子目录随其真实能力一起实现；不存在的提供方不创建空驱动。

## 2. HTTP 按业务就近组织

content 的协议文件示意：

```text
apps/api/src/http/content/
  collections.routes.ts
  documents.routes.ts
  documents.schema.ts
  publications.routes.ts
  publications.schema.ts
  versions.routes.ts
  versions.schema.ts
  __test__/
    documents.http.test.ts
    publications.http.test.ts
```

routes 文件内定义路径、验证和薄 handler，保留 Hono 的参数类型推断；不为一次调用增加 controller → service 转发链。独立复用或明显影响阅读的请求/响应 schema 才拆成同功能的 schema 文件，小 schema 可以共置。组织方式遵循 [Hono 路由组合建议](https://hono.dev/docs/guides/best-practices)。

业务输入/结果类型由 CMS 所属模块维护，HTTP schema 负责请求/响应的运行时协议验证和 OpenAPI。Drizzle 行类型不能直接成为公开 DTO；内容 data 的字段规则仍只消费 content 的规范化定义，不能在 HTTP 再维护一套。

跨模块业务编排归所属用例。例如创建管理员、分配角色和记录邀请由 access 的管理员用例协调 identity，HTTP 不分别调用多个写接口拼装这个业务事务。审计查询或当前用户投影同样由已定义的业务入口提供。

## 3. 每个模块的公共边界

```text
<module>/
  index.ts                          显式公开业务 API 类型、必要输入/结果及操作定义
  composition.ts                    构建模块实例和受限事务参与能力
  operations.ts                     Hono 无关的操作身份、范围与策略声明
  <业务职责>/                       用例、规则及必要类型
  adapters/postgres/                该模块拥有的 SQL 查询与持久化映射
```

这是公共边界模式，不是每个目录必须机械创建这些文件。只消费某类基础能力的 platform 模块无需制造不存在的 HTTP operation。index.ts 只写有调用方的明确导出，不做 export * 根桶，也不为文件系统路径制造一串转发 index。

composition 返回可调用的业务 API 以及确有跨模块原子协作需求的事务参与能力。业务 API 接收主体和输入，不暴露数据库对象；事务参与能力只使用调用者给定的事务，没有自行提交、回滚或开启独立事务的权限。HTTP 仅获得业务 API，不能取得后者。

应用 bootstrap 导入各 composition，按无环依赖顺序注入。跨模块可通过指定的公开类型引用所需能力，实例仍由 bootstrap 装配；不直接构造别人的仓储或访问其 adapters。应用实例不捕获用户 Actor，主体与 requestId/取消信号按调用显式传入。

数据库查询放在模块的 adapters/postgres，表定义和迁移放 database，保持业务所有权就近。当前固定 PostgreSQL，不为每张表增加 repository interface + implementation + manager；使用显式 Drizzle 事务与内聚查询函数即可。

Collections 与资源管理的完整功能和编译边界见 [能力设计](collections-and-assets.md)。content/generate 是额外的构建期入口：生成命令调用 content 的定义归一化及 PostgreSQL 映射编译，再调用 database 的物理计划渲染。数据库包不加载应用配置、不导入 CMS；生成代码只依赖数据库工具。类型生成和 schema 生成不能复制两份字段语义。

platform 下三个小能力可在各自 postgres.ts 中组织内聚 SQL，不机械复制复杂业务模块目录。schema owner 检查将这些用途固定的文件逐项列入白名单。

## 4. content 的具体职责

```text
packages/cms/src/content/
  index.ts
  composition.ts
  operations.ts
  generate.ts                       构建期内容生成能力入口
  collections/
    definition.ts                   受支持的集合定义
    create-registry.ts              校验、归一化及只读注册表
    __test__/registry.test.ts
  fields/
    definition.ts                   支持的字段类型及约束
    validate-data.ts                草稿和发布校验模式
    collect-references.ts            从合法内容提取关系及文件引用
    __test__/validation.test.ts
  queries/
    parse-query.ts
    __test__/query-behavior.test.ts
  documents/
    create-document.ts
    read-document.ts
    save-document.ts
    publish-document.ts
    unpublish-document.ts
    archive-document.ts
    restore-trashed-document.ts
    purge-document.ts
    __test__/publication.test.ts
  versions/
    list-versions.ts
    read-version.ts
    restore-version.ts
    compare-versions.ts
    retention.ts
    __test__/restoration.test.ts
  uploads/                          上传型集合与字节能力的编排
  folders/                          文档目录及移动规则
  jobs/                             定时发布与版本保留任务
  adapters/postgres/
    compile-schema.ts               字段语义到物理存储计划
    compile-query.ts                查询与权限到 SQL
    documents.ts
    versions.ts
    __test__/transactions.integration.test.ts
```

collections 维护定义、归一化与能力注册；fields 处理基础/嵌套/关系/本地化字段规则、值和引用提取，不调用 Hono 或执行 SQL。queries 处理有界 AST、字段路径及投影/展开语义；adapters/postgres 将其与授权条件编译成 SQL，并将定义编译成物理计划。documents/versions/uploads/folders 编排授权、锁、状态转换、查询、审计和幂等，不改写集合定义；查询适配器不决定发布权，不自行提交事务。

content 内部依赖为 collections → fields，documents/versions → collections/fields/所属查询；fields 不反向导入集合注册、文档或版本用例。恢复与保存需要共用写入步骤时，提取实际复用的事务内函数，不从恢复操作调用另一个会独立鉴权、幂等和提交的顶层用例。SQL 查询显式接收已解析资源范围，rows/total 使用同一约束，不以缺省参数表示无限制读取。

一个文件可以包含紧密协作的私有辅助函数；并非每个函数都拆文件。read-document 包含其内聚的查询投影规则；通用字段验证不得反向依赖文档发布用例。上述文件是完整阶段的职责示例，未启用字段没有占位处理器。

## 5. 其他模块及后台工作的归属

| 模块 | 内部业务职责 | 持久化与外部能力 |
| --- | --- | --- |
| identity | accounts、sessions、action-tokens | accounts/credentials/session/token 查询归 identity；密码算法、邮件传输通过其定义的窄能力注入 |
| access | authorization、admins、roles、permissions、navigation、endpoints | 所属查询归 access；管理员用例消费 identity 的受限事务参与能力 |
| content | 集合、字段、查询、文档/版本、上传型集合、文件夹、发布/保留任务 | 生成的集合数据和内容编排归 content；通过注入的 assets 能力处理字节与引用 |
| assets | uploads、manifests、processing、references、jobs | 上传会话/文件清单/原件派生对象/引用/恢复记录归 assets；对象存储和图片处理能力注入 |
| audit | 脱敏追加规则、审计查询 | 审计追加能力使用调用者事务；读取能力经注入授权策略保护 |
| platform | 幂等、原子限流、安全锁各自独立 | 拥有各自 SQL 协作协议；不能导入 identity/access/content/assets/audit |

外部 SDK 实现位于 apps/api/src/adapters，只依赖相应 CMS composition 公开的能力类型，不在 SDK 适配器中实现角色判断、版本恢复或资产引用策略。配置由 bootstrap 显式传入；模块定义接口，部署选择实现。

PostgreSQL 查询位于 CMS 模块内是本项目固定数据库的明确取舍；对象存储、邮件和密码实现位于应用外层是为了隔离真实提供方和 Node 资源生命周期。这两种位置按变化原因划分，不混成一个全局 infrastructure/repositories 目录。

持久化任务处理器放在所属模块，例如 assets/jobs 的过期上传与删除恢复、identity 的过期令牌清理及投递观察状态收敛。身份邮件按用户裁决不持久化可恢复令牌、不自动重投；有界内存执行器由应用装配和关闭，投递状态规则归 identity。worker.ts 只装配和运行已注册处理器，领取/停止遵守安全基线，不把任务状态机写在进程入口。新增持久化结构由所属模块维护表定义、迁移和恢复测试，详见[专项方案](user-rbac-design.md)。

content/jobs 负责定时发布、版本裁剪及相关权限复查；assets/jobs 负责字节处理和物理清理。媒体自定义字段、文件夹归属和文档替换都进入 content，不另外写一套固定字段 files CRUD。content 固定历史所需清单后调用 assets 的事务参与能力；assets 不读取 content 私有表来猜测可删除性。

## 6. 精确导出与依赖约定

当前私有包名为@new-cms/api、@new-cms/cms、@new-cms/database。身份/RBAC实际入口以各manifest为准；尚未实现的content/assets出口不预建。下表同时包含对应后续阶段的目标出口。

| 导出类型 | 允许的调用方 | 禁止的用法 |
| --- | --- | --- |
| @new-cms/cms/content 等五个模块入口 | HTTP、相关模块及测试使用公开业务类型/操作定义；业务调用通过装配注入的 API | 穿入模块私有目录，或从根桶取得任意能力 |
| @new-cms/cms/content/composition 等明确列出的五个装配入口 | bootstrap；相关模块仅引用已批准事务能力的类型；测试装配 | HTTP 导入工厂/事务参与能力，业务用例自行创建另一模块实例 |
| @new-cms/cms/content/generate | 内容生成 command 及生成测试 | HTTP/普通业务请求执行代码生成或 DDL |
| @new-cms/cms/platform/idempotency、rate-limits、security-lock | CMS 用例、对应装配及测试 | HTTP 绕过用例直接消费 SQL 协作能力 |
| @new-cms/database/client | bootstrap、数据库所属实现、CMS composition/内部事务代码及测试 | HTTP 直接持有连接或事务 |
| @new-cms/database/migrate | 一次性迁移 command 及数据库测试 | 普通请求触发迁移 |
| @new-cms/database/privileges | bootstrap生产就绪校验、一次性权限配置command及真实数据库测试 | HTTP或业务请求执行GRANT、越过部署权限边界 |
| @new-cms/database/schema-plan | CMS PostgreSQL 编译器、生成能力及测试使用物理计划类型 | 反向导入 CMS 语义或执行环境初始化 |
| @new-cms/database/codegen | 内容生成 command 及数据库生成测试 | 业务请求生成或修改 schema |
| @new-cms/database/schema/identity 等逐项列出的 owner 路径 | 对应模块的 adapters/postgres；经审查的跨域授权投影 | HTTP、任意用例或另一个模块直接修改表 |

生成的内容表通过明确的 @new-cms/database/schema/generated/content 入口提供给 content 所属实现，所有权仍是 content；不以 schema/generated/* 的任意 wildcard 暴露全部内部文件。该入口是生成物清单，不手工维护第二套表定义。

依赖图沿用架构基线：access → identity，content → assets/access，assets → access，各模块可使用 audit/platform 和自己的数据库实现。主体等公开类型需要额外的单向类型依赖时，须加入图中；类型导入也不允许循环。audit 的读取授权通过装配注入，不反向导入 access。

SQL 表 owner 及授权投影例外以架构基线的数据所有权表为准。对 schema 的可见性不是写权限；不能通过 raw SQL 绕过 owner 后声称通过了导入检查。

## 7. 测试位置与人审路径

规则和用例测试放其同目录 __test__；字段、集合、文档、版本及查询适配器分别就近测试。单测验证子模块公开规则或装配后的业务 API，不断言私有函数顺序。真实 PostgreSQL 集成测试验证外键/唯一约束/事务和并发；HTTP 测试放相应协议目录的 __test__。

公共装置放根 test/support，通过统一装置创建隔离数据库及存储/邮件接缝，负责释放资源。生产代码不能导入该目录。模块间不借用别人的 __test__；跨模块业务通过公开入口验证。e2e 负责真实进程及 Node 网络行为，不用内存 Hono 请求代替。

发布文档的审查顺序固定为：

```text
http/content/publications.routes.ts 与协议 schema
  → content/operations.ts 的稳定身份和范围规则
  → content/documents/publish-document.ts
  → fields 的完整校验及 assets 的事务内引用能力
  → content/adapters/postgres 的锁、版本指针和 revision
  → 同事务 audit/idempotency
  → publication 行为测试、事务集成和 Node 旅程
```

这是一条定位路径，不额外引入总线、事件框架或为每步建立转发类。工程验收必须包含这条真实链的失败与恢复行为。

设计阶段按三条链检查归属：发布在 content 协调 assets 清单引用和审计；邀请管理员在 access 协调 identity/角色及邮件投递意图；媒体清除在 content 校验外部引用并释放自身历史引用，再由 assets 登记/执行物理清理。它们都不要求 HTTP 持有事务、不要求 assets 反向调用 content，也不在 SQL 事务中等待 SMTP/文件传输。这是设计推演，不能记作运行测试通过。

## 8. 架构检查的落实状态

现有工具检查工作区显式exports、相对路径逃逸、解析目标/别名、包反向依赖应用及私有__test__引用。本期新增真实CMS/HTTP代码后，已扩展HTTP禁止database/composition/SQL平台能力、identity不得依赖access、platform不得导入业务、database不得依赖CMS、跨模块相对私有导入及schema owner导入约束，并有合法与违规CLI样本。HTTP可消费纯platform/contracts类型及错误契约。

当前静态规则覆盖已约定领域DAG与适配器到HTTP的禁止方向；它不能证明raw SQL表写所有权、任意新领域或环境读取限制，这些仍需代码审查。content/assets及生成入口落地时增加对应owner/DAG、无生成物构建和合法/违规样本，不预建空检查。操作注册、OpenAPI、授权目录和HEAD行为已由真实Hono测试验证。

身份/RBAC已有单一运行实现、精确公开入口及初始迁移，无旧业务调用方或存量数据迁移。内容相关目录仍是目标设计，只在真实功能实施时创建。当前检查范围与实际结果见[专项施工图](user-rbac-implementation.md)及[交付记录](review-log.md#后台账户rbac后端与工程门禁交付)。
