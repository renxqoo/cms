# CMS 后台账户与 RBAC 施工图

状态：本期后台账户/RBAC后端已核销，2026-10-25；测试结果及验收范围见[本轮交付记录](review-log.md#后台账户rbac后端与工程门禁交付)。[设计基线](user-rbac-design.md)定义裁决和不变量，[单元文档](user-rbac-units.md)定义字段、协议及验收矩阵。新能力继续采用 feature-dev-v2，不执行参考仓库迁移。

## 1. 存量盘点与参考裁决

本地 new-cms 无存量业务账户或数据库调用方；规范工具与现有 Collections 完整能力设计必须保留。用户已明确授权初始化本地Git及记录现有工程基线，基线提交为bb01bf5；origin已配置为https://github.com/renxqoo/cms.git；按用户裁决本轮仅本地提交，不push。并行开发使用独立worktree，不共享写入目录。

Tillgate 只读参考，不连接其数据库、不读取凭据、不执行写入。以下来源按实际实现和测试核对，注释不能代替行为；旧探针证据见[参考审计](reference-audit.md)，本轮不把旧探针称为新运行的结果。

| 编号 | 参考文件/行为 | 裁决及目标 |
| --- | --- | --- |
| R1 | packages/db/src/schema/admins.ts、users.ts | 保留后台账户概念；不纳入网关客户、钱包、费率及用户 realm |
| R2 | packages/db/src/schema/identity.ts、control-plane/adapters/postgres/admin-store.ts | 重设计为真实账户外键及单一身份；不复制 admin 数字 ID 分段或无 realm 凭据命名空间 |
| R3 | admin-api/http/routes/admins.ts、control-plane/application/admins | 保留邀请/启停/角色分配；跨域写入及审计移到 access 最外层事务，不复制 HTTP 补偿编排 |
| R4 | packages/db/src/schema/rbac.ts、control-plane/application/rbac | 保留动态角色/授权；权限身份与菜单树分离；code/scope 不变；增加版本冲突与引用保护 |
| R5 | admin-api/http/middleware/session.ts | 保留下一请求读取状态/授权；使用 opaque 会话及 writer，业务入口复核，移除可选 owner 的生产放宽路径 |
| R6 | admin-api/http/middleware/acl.ts、http/routes/endpoints.ts | 只消费真实匹配 operationId；不复制 method/path 的独立匹配及宽泛自身前缀放行 |
| R7 | admin-api/src/startup-rbac.ts | 迁移/必要目录核对失败不能 ready；不复制异步告警后继续监听 |
| R8 | admin-api/__test__/routes-rbac.test.ts、control-plane/__test__/rbac-dynamic.test.ts | 改写行为矩阵；旧测试允许改码/删节点的规则不作为新规格；不用源码字符串证明授权 |
| R9 | 当前 architecture.md §7 与 security-baseline.md §5 | 用户 U3 推翻身份邮件自动重投；保留摘要/投递结果，失败只能显式重新发起 |

旧测试不迁移为目标实现测试；每项新断言来自用户裁决、明确契约或手算矩阵。只读参考的缺陷不在 Tillgate 修复。

## 2. 文件、导出与装配

目标位置遵循 code-organization.md，仅随实现批次创建有调用方的文件。

| 位置 | 交付 |
| --- | --- |
| packages/database/src/schema/identity.ts、access.ts、audit.ts、platform.ts | 单元文档表结构、外键、唯一/检查约束；一条迁移链 |
| packages/cms/src/identity | accounts、sessions、action-tokens、投递尝试及清理；所属 adapters/postgres、就近 __test__ |
| packages/cms/src/access | authorization、admins、roles、permissions、navigation、endpoints；操作声明及所属 SQL |
| packages/cms/src/audit、platform | 脱敏追加、幂等、原子限流、安全锁；不扩成通用 workflow/UoW |
| apps/api/src/http | 统一契约/handler、OpenAPI与HTTP测试；消费各模块操作声明及注入业务API |
| apps/api/src/bootstrap、adapters、commands | 配置/资源装配、Node 密码/邮件、迁移/超管初始化/目录核对命令 |
| test/support | PostgreSQL 隔离、可编程 SMTP、网络进程和故障屏障；不跨引私有 __test__ |
| e2e | Bun 开发与 Node 产物执行相同身份/RBAC旅程 |

公共入口使用已有规划的 @new-cms/cms/identity、access、audit 与对应 composition；schema 使用对应 owner 的精确子路径。业务 API 返回 DTO/业务结果，不返回 Drizzle 行或事务。错误公共类型按真实调用方最小导出，不创建根全量桶或 wildcard。

bootstrap 注入 identity 主体解析、access 授权、audit 追加、平台协议及只读集合范围目录。identity 定义密码/邮件能力的窄契约，应用适配器实现；identity 不依赖 access。安全管理用例由 access 编排，在同事务调用 identity 修改账户，不能在子能力提前提交。

## 3. 测试装置适配清单

现已建立test/support中的数据库、SMTP及进程装置，以及实际Hono协议和Bun/Node跨进程旅程。下表区分本期装置与内容阶段的后续接缝；执行结果按本轮交付记录，不把历史工具测试作为业务证明。

| 装置 | 必要适配及可信性验证 |
| --- | --- |
| PostgreSQL | 每次运行独立 schema/角色，执行正式迁移；teardown 清理；池级锁、死锁/回滚/并发屏障测试；测试连接不能指向生产 |
| HTTP | 实际 Hono 路由注册与协议栈；测试公开 API，不按 handler 私有调用次数断言 |
| SMTP | 本地可编程接收器：accepted、拒绝、接收后断开、超时；邮件链接取真实输入；默认不访问真实邮箱 |
| 密码 | 单测可用可控适配器；至少一组集成/网络旅程使用生产密码算法，验证参数、未知账户及并发预算 |
| 时间/随机 | 规则测试注入时钟/随机；数据库期限/并发测试用真实 DB 时间与有界屏障，不靠长 sleep 猜交错 |
| 进程 | 实际启动 Bun 开发与构建后的 Node 服务；验证断连、重启、退出后端口/连接/句柄可回收 |
| 范围 | access测试注入articles/pages两个测试范围验证授权协议；生产尚无content范围，不能将其称为真实集合功能 |
| 崩溃点 | 提交前、提交后响应前、SMTP 接收后落库前、密码计算中取消；观察 DB 终态及外部接收次数 |

Tillgate 越权/路径探针转化为本项目公开接口回归；静态/参数路径注册顺序反转、HEAD 和 scope 隔离均必须验证。没有目标实现前不伪造“缺陷前失败”；实现中发现 bug 时先保存真实失败证据，再修复并补回归。

## 4. 实施批次与最小正式切片

批次只决定顺序，不削减完整用户/RBAC或既有 Collections 能力。当前授权实施后台账户/RBAC；先以真实管理员/角色读取、授权与撤权完成本模块正式切片，再完成本模块全部接口。正式内容引擎、草稿/发布及其联合旅程由内容批次交付，不在本模块引入临时内容替身，也不把该联合旅程标为已完成。

| 批次 | 实现及测试计划先行内容 | 出口条件 |
| --- | --- | --- |
| P0 工程与装置 | 真实私有工作区、Node API 构建、数据库迁移/配置、精确 owner/HTTP 导入门禁及绕过样本；隔离 DB/SMTP/网络装置；保留现有工具测试 | 迁移可在空库执行、Node 实际监听/退出；脚本/覆盖匹配真实业务 |
| P1 最小正式切片 | 系统超管初始化、会话、只读角色/权限/绑定、邀请激活、真实角色读取及下一请求撤权；内容联合旅程留给正式内容批次 | 走完下述旅程、四门、独立审查、故障/资源恢复；发现规格缺口先改三件套 |
| P2 身份闭环 | 账户列表/资料/启停/归档、邀请重发、改密/找回、会话上限、投递反馈与清理、最后超管并发 | I1— I4、S1—S4 的身份相关矩阵通过 |
| P3 完整 RBAC | 角色 CRUD/全量授权、权限 CRUD/引用保护、完整菜单/投影、真实目录/可配置绑定、scope/版本及审计 | A1—A5、全部主体×操作×范围矩阵及冲突测试通过 |
| P4 收口 | 全 DTO/OpenAPI、一致性/容量、Bun 与 Node 网络旅程、部署前说明和安全初始化文档 | 全范围验收、实际覆盖率、独立审查问题清零、假绿抽查 |

P1 本期正式旅程：离线迁移及目录核对 → 初始化超管 → 登录 → 创建只读角色并授予角色读取权限 → 邀请并激活管理员 → 登录 → 真实角色读取成功 → 管理写入拒绝 → 超管撤权 → 下一请求读取拒绝 → 注销后旧令牌拒绝。相同旅程分别启动Bun开发进程与真实Node构建产物，并使用生产密码算法和本地SMTP。

内容阶段仍须交付正式集合草稿、发布、跨集合隔离与撤权的联合旅程；当前角色读取旅程不证明内容能力已完成。本期后端继续作为内容阶段的身份/授权基础，不建立临时内容替身。

## 5. 工程门禁与覆盖率

纯方案阶段仅核对文档内容、引用和格式；不运行四项工程门禁，不引用历史测试数字作为本轮结果。

业务代码批次必须扩展实际 package.json 后执行：lint（架构/owner + 类型感知 Oxlint 0/0 + Oxfmt）、typecheck（用户确认的bun check）、Node API build、test（单元/真实 DB/覆盖率/Bun及Node冒烟）。本期没有 UI，Next.js 构建/浏览器页面不冒充后端验收；未来 UI 批次再按 AGENTS 加入对应门禁。

vitest.config.ts现覆盖全部packages/*/src/**/*.ts、apps/api/src/**/*.ts及原tooling/oxlint-plugin范围，仅排除__test__。全局与保留的插件专属门槛均为statements 90%、branches 85%、functions 90%、lines 90%；不排除入口、命令、SQL或HTTP适配器。实际覆盖率及插件匹配范围分别记录于本轮交付记录，不能外推到未实现的内容/UI。

新增 test:e2e 为真实统一入口，支持按 e2e 文件选择，Bun/Node 旅程都必须进入门禁；依赖缺失应失败，不能 passWithNoTests、条件 skip 或仅报告工具测试通过。每批四门后做独立对抗审查，修正后重跑受影响及必要全门；不反复扩大无关测试。

## 6. 发布、兼容窗口与回滚

本项目没有存量业务数据，初次实现不需要导入 Tillgate，不建兼容 alias、双收参数或两套会话。数据库迁移先行，应用核对迁移/操作目录兼容通过才 ready；不在 API 启动中执行 DDL。

滚动兼容窗口为一次发布内“新旧受支持产物同时存活”的明确窗口；发布清单必须列出两个版本及目录/迁移兼容范围。操作目录新增只增不删；旧实例全部摘流且在途请求/任务排空、最大 15 秒请求期限过去、旧产物不再接流量后，发布命令方可删除退役操作及无引用结构。监控 ready 拒绝、无绑定 403、授权失败、版本冲突、安全锁等待、连接占用、投递 unknown 与幂等冲突；指标不使用用户/资源 ID 高基数标签。

每批可独立回退代码产物，保留兼容的新增表/列；已有账户/审计不得为回滚删除。安全授权一旦撤销，回滚不能恢复旧授权快照；回退产物必须仍读当前 writer 和安全表。如果数据库出现破坏性变化，另行定义备份、回填、验证、切换、删除条件与恢复演练，不执行无数据保留的 down。初次上线前无业务数据时才能在明确隔离环境重建测试库。

令牌已提交、响应丢失时：登录可再次登录并受会话上限限制；密码消费不自动重放，通过新登录或重新申请恢复；账户/邀请管理写按幂等键查询原结果。邮件不因产物回退自动重发。用户部署和发布授权仍单独取得；Git初始化和origin已获用户授权，本轮只做本地提交，不push或部署。

## 7. 方案独立审查与处置

2026-10-25，由独立上下文 review_user_rbac_plan 只读三件套及必要引用，按“假设方案是错的”审查契约、越权、并发、投递、生命周期及验收。审查者未修改文件、未执行业务或工程测试。

| 编号 | 发现及触发场景 | 处置及复核 |
| --- | --- | --- |
| AR1 / P1 | 普通改密后旧password_reset token未明确撤销，持旧链接者可能再次覆盖新密码 | 设计§7及单元§5明确改密/重置/激活、禁用/归档、角色分配同事务撤销其余未终结token；I3补旧链接失效矩阵；独立复核关闭 |
| AR2 / P2 | 2000→2000全量授权替换差异约156KiB，超过初稿32KiB审计上限，合法操作因审计失败整体回滚 | 审计预算统一256KiB，仅存added/removed UUID及计数；A1补最大差异完整落库验收，不截断、不减授权容量；独立复核关闭 |

最终复核未发现其他可确认问题；这只表明设计审查发现已处置，不代表业务实现、安全测试或容量已验证。用户随后授权按本方案开始实现，三件套推进为定稿；实施期继续独立审查。

## 8. 验收清单

方案阶段：

- [x] 用户 U1/U2/U3、既有基线与本轮建议分别记录。
- [x] 当前代码/测试/工具事实与后端目标分开。
- [x] 表所有权、接口/错误、副作用时序、并发预算及越权矩阵明确。
- [x] 三件套完成独立审查，2项发现均修正并经独立复核关闭。
- [x] 本地链接、围栏、表格、操作身份唯一性及跨文档裁决一致性核对完成。

业务实施阶段，实际结果见本轮交付记录；以下仅指本期后台账户/RBAC：

- [x] 已实现接口、状态转换、scope协议、最后超管及单次消费并发验证。
- [x] 参考场景按本期新契约验证，真实PostgreSQL回滚、约束与竞争测试。
- [x] 四门、匹配范围、用例数及四项覆盖率实际记录。
- [x] Bun/Node网络e2e、邮件不确定性及取消/容量/退出恢复。
- [x] 假绿抽查：无skip、无断言弱化、无缩小原范围或降阈值；bun check真实类型错误探针失败。
- [x] 实现期独立审查发现全部复核关闭；所有权、公开导出及文档同步。
- [x] 通过门禁后仅本地提交本次点名文件；不push，远程CI及部署未执行。

## 9. 并行实施协作契约

数据库/平台、identity、access分别在独立worktree开发；主agent负责共享manifest/锁文件、HTTP/启动/配置及集成。子agent不修改根manifest、锁文件、全局测试或lint配置；测试通过真实PostgreSQL和本地SMTP装置，不访问业务数据库。主agent统一安装新增稳定依赖，不升级已有工具依赖。

数据库公开 @new-cms/database/client：SqlExecutor 提供类型化 query(text,values?)；Database扩展query及 transaction(work,signal?)、close()，transaction向work传入SqlExecutor；createDatabase({connectionString,schema?,maxConnections?,statementTimeoutMs?,lockTimeoutMs?,connectionTimeoutMs?})。schema仅允许合法标识符并设置受限search_path。migrate(database)从正式SQL迁移创建结构，单独命令调用，不在API启动执行DDL。

CMS共享 @new-cms/cms/platform/contracts 定义 RequestContext(requestId,ip,token?,idempotencyKey?,signal?)、CmsPolicy、OperationDefinition(id,module,method,path,access,scopeKind,bindingConfigurable,defaultPermission?)、CmsError及fail(code)。OperationDefinition无Hono依赖，HTTP只消费业务操作声明，默认权限与操作同源。CmsPolicy的默认值属于应用配置，底层只消费显式注入值。

platform/security-lock 提供 securityTransaction(database,policy,mode,work,signal?)，mode为shared/exclusive；最外层用例先锁后鉴权再执行。platform/idempotency提供同事务去重能力，platform/rate-limits提供共享原子计数，audit/composition提供同事务appendAudit(tx,event,policy)及授权后查询；这些属于本轮实际调用的明确入口。

identity/composition 的 createIdentity({database,policy,passwords,mailer}) 返回api、participants、initialize能力与close/maintenance。api方法包括login/logout/changePassword/acceptInvitation/requestPasswordReset/resetPassword，统一(ctx,input)调用并在业务入口验证未知输入。participants只供access事务编排：authenticate(tx,ctx)、account(tx,id)、listAccounts(tx,input)、createAccount(tx,input)、updateAccount(tx,input)、issueInvitation(tx,adminId,ctx)、delivery(tx,id)、preparePassword(input,signal?)、initializeAccount(tx,input)。issueInvitation返回公开delivery与仅内存的dispatch闭包，调用方确认事务提交后才执行，幂等重放不执行；不得把闭包或token写入幂等结果。参与能力的具体TypeScript类型由identity公开composition定义，access只导入已批准的类型并注入实例。

access/composition 的 createAccess({database,policy,identity,operations,collectionKeys,navigationPaths,navigationIcons})返回api、authorize、reconcile、verifyReady、initializeAdmin。api包含单元文档全部管理员/角色/权限/菜单/接口、me及audit查询方法，统一(ctx,input)。authorize(tx,ctx,operationId,scope)从注入identity能力认证，再查有效角色/绑定；scope平铺，默认global；reconcile只由发布命令调用，verifyReady只核对、不自动修复解绑；initializeAdmin复用identity能力。公开api和装配入口分离，HTTP不直接导入composition或数据库。

并行分工允许在发现接口不闭合时通过协调消息修改本节，不能各自创建名称相似的第二套能力。生产只注册真实已实现用户/RBAC操作；collection范围由注入的真实范围目录提供，测试可注入两个测试范围验证授权协议，不能将该测试称为内容功能交付。

## 10. Git hooks 与 CI 扩展

用户裁决：本轮增加Husky及GitHub Actions CI，并完成本地提交。用户提供远端https://github.com/renxqoo/cms.git；此前“暂不push”的指令保留，本地提交不自动触发远程执行或部署。

这是小级工程扩展，沿用本方案：pre-commit执行lint及typecheck，pre-push执行build及test；Husky prepare安装本地hook。CI在push/pull_request运行四门，固定Bun1.4.4与已验证Node版本，使用隔离PostgreSQL17服务和本地SMTP测试装置，只授予contents:read，不部署。官方Actions核实版本并固定完整SHA。新测试连接显式由CMS_TEST_DATABASE_URL提供，不能连接生产数据。

验收以真实hook失败阻断/顺序、YAML结构和本地四门为准；未推送前不得宣称远程CI通过。本地提交不禁用hook；CI仅安装依赖时设置HUSKY=0，随后显式运行四门。真实临时仓库已验证lint/typecheck失败阻断commit及build/test失败阻断push，并验证成功路径；未向项目远端push。


## 11. 本期实施核销

本期后台账户/RBAC后端按P0—P4完成，34个真实业务操作及其HTTP/OpenAPI、14张表、适配器、清理与并发协议均有单一实现。四门、独立审查及Bun/Node旅程结果见[交付记录](review-log.md#后台账户rbac后端与工程门禁交付)。具体内容/文件引擎及前端不在本期核销范围。

实现期间收口了行锁后的真实期限、维护CAS、UUID大小写、取消后的正文准入、碎片缓冲、响应头及配置TLS等缺口，真实回归先失败后通过。邮件发送和观察任务各受配置并发上限约束；默认分别4项，观察容量不足时保留待维护收敛的状态，不新建无界后台任务。


## 12. 启动配置诊断与本地初始化

本机开发先显式准备.env、DATABASE_URL及至少32字符的CMS_RATE_LIMIT_SECRET，再运行迁移和操作目录核对。API不自动建库、迁移或修复绑定。启动时若配置校验失败，错误列出缺失或非法的环境变量名并提示.env.example；不输出值、连接串、密码、令牌、Zod原始错误或堆栈。其他启动错误继续使用脱敏通用提示并以非零状态退出。

受影响面仅为进程失败输出、回归测试及启动文档；不改公共包导出、HTTP/DTO、持久化结构、异步任务或前端。先通过真实Bun进程复现缺失配置的模糊输出，再以缺失字段、非法敏感值及未知错误的测试验证。验证本机准备成功后，运行既有四门；不将本机.env或凭据提交到Git。


## 13. 超管初始化输入与错误提示

初始化命令在输入前显示现有密码要求：15—128个Unicode码点且UTF-8不超过512字节，保留空格。命令通过identity公共入口的newPasswordSchema复用业务校验，新增该精确符号导出，不复制密码判断、不降低要求。非法密码在创建运行资源和写数据库之前拒绝，错误明确说明密码规则；环境配置先于密码读取验证。

命令对已有有效超管、邮箱已占用、无效账户资料和必要目录不可用返回明确脱敏提示；未知故障保留通用错误。只格式化已知错误类别，不输出密码、连接串、Zod原始错误、未知异常消息或堆栈。失败均非零退出，仍仅允许无有效超管时初始化，不创建默认密码或自动提权。

本次影响公共schema导出、CLI输入/输出及测试，无HTTP/DTO、数据库结构或前端变化。先用真实Bun进程复现弱密码只有通用失败提示，再补14/15/128/129码点、空值和合法Unicode输入、已存在超管拒绝、无副作用及敏感信息脱敏回归；复用隔离PostgreSQL装置与既有Bun/Node旅程。提交前完成四门与独立只读审查；本机账户及密码由用户在自己的终端创建。


独立审查进一步复现终端UTF-8跨chunk解码会改变密码，以及取消/超长输入误报数据库故障。本轮使用严格UTF-8流式TextDecoder保持字节流边界，输入错误使用有限类别与固定安全文案，关闭时恢复原始终端状态和监听。通过Bun原生PTY装置验证分块Unicode、退格、取消与超长输入，测试补充Bun1.4.4官方类型，不引入PTY框架或Python运行时；生产代码继续只用Node/Web能力。
