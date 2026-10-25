# CMS 后台账户与 RBAC 施工图

状态：草稿，2026-10-25；仅方案阶段。[设计基线](user-rbac-design.md)定义裁决和不变量，[单元文档](user-rbac-units.md)定义字段、协议及验收矩阵。新能力继续采用 feature-dev-v2，不执行参考仓库迁移。

## 1. 存量盘点与参考裁决

本地 new-cms 业务目录为空，无需迁移现有账户、JWT、数据库或调用方；规范工具与现有 Collections 完整能力设计必须保留。git status --short 已执行，结果为目录非 Git 仓库；不初始化 Git、不猜测远端，不隐藏或格式化已有文件。

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
| apps/api/src/http/identity、access、audit | 路由/schema/HTTP 测试；只调用注入业务 API |
| apps/api/src/bootstrap、adapters、commands | 配置/资源装配、Node 密码/邮件、迁移/超管初始化/目录核对命令 |
| test/support | PostgreSQL 隔离、可编程 SMTP、网络进程和故障屏障；不跨引私有 __test__ |
| e2e | Bun 开发与 Node 产物执行相同身份/RBAC旅程 |

公共入口使用已有规划的 @new-cms/cms/identity、access、audit 与对应 composition；schema 使用对应 owner 的精确子路径。业务 API 返回 DTO/业务结果，不返回 Drizzle 行或事务。错误公共类型按真实调用方最小导出，不创建根全量桶或 wildcard。

bootstrap 注入 identity 主体解析、access 授权、audit 追加、平台协议及只读集合范围目录。identity 定义密码/邮件能力的窄契约，应用适配器实现；identity 不依赖 access。安全管理用例由 access 编排，在同事务调用 identity 修改账户，不能在子能力提前提交。

## 3. 测试装置适配清单

当前只有 tooling Vitest，无业务 PostgreSQL/HTTP/跨进程装置，不能声称复用已存在 e2e 服务。首个批次建立最小装置并接入真实脚本；本节列目标交付，不给不存在的包命令。

| 装置 | 必要适配及可信性验证 |
| --- | --- |
| PostgreSQL | 每次运行独立 schema/角色，执行正式迁移；teardown 清理；池级锁、死锁/回滚/并发屏障测试；测试连接不能指向生产 |
| HTTP | 实际 Hono 路由注册与协议栈；测试公开 API，不按 handler 私有调用次数断言 |
| SMTP | 本地可编程接收器：accepted、拒绝、接收后断开、超时；邮件链接取真实输入；默认不访问真实邮箱 |
| 密码 | 单测可用可控适配器；至少一组集成/网络旅程使用生产密码算法，验证参数、未知账户及并发预算 |
| 时间/随机 | 规则测试注入时钟/随机；数据库期限/并发测试用真实 DB 时间与有界屏障，不靠长 sleep 猜交错 |
| 进程 | 实际启动 Bun 开发与构建后的 Node 服务；验证断连、重启、退出后端口/连接/句柄可回收 |
| 范围 | 由 content 正式配置/归一化能力提供 articles/pages 两个隔离测试集合；不在生产代码放 mock 集合 |
| 崩溃点 | 提交前、提交后响应前、SMTP 接收后落库前、密码计算中取消；观察 DB 终态及外部接收次数 |

Tillgate 越权/路径探针转化为本项目公开接口回归；静态/参数路径注册顺序反转、HEAD 和 scope 隔离均必须验证。没有目标实现前不伪造“缺陷前失败”；实现中发现 bug 时先保存真实失败证据，再修复并补回归。

## 4. 实施批次与最小正式切片

批次只决定顺序，不削减完整用户/RBAC或既有 Collections 能力。方案交付后实施另按用户指令开始；本轮不创建以下业务文件。

| 批次 | 实现及测试计划先行内容 | 出口条件 |
| --- | --- | --- |
| P0 工程与装置 | 真实私有工作区、Node API 构建、数据库迁移/配置、精确 owner/HTTP 导入门禁及绕过样本；隔离 DB/SMTP/网络装置；保留现有工具测试 | 迁移可在空库执行、Node 实际监听/退出；脚本/覆盖匹配真实业务 |
| P1 最小正式切片 | 系统超管初始化、会话、编辑角色/单权限/绑定、邀请激活、受保护内容操作及撤权；依赖全局实施计划中的正式最小集合编译，不写临时 JSONB 业务实现 | 走完下述旅程、四门、独立审查、故障/资源恢复；发现规格缺口先改三件套 |
| P2 身份闭环 | 账户列表/资料/启停/归档、邀请重发、改密/找回、会话上限、投递反馈与清理、最后超管并发 | I1— I4、S1—S4 的身份相关矩阵通过 |
| P3 完整 RBAC | 角色 CRUD/全量授权、权限 CRUD/引用保护、完整菜单/投影、真实目录/可配置绑定、scope/版本及审计 | A1—A5、全部主体×操作×范围矩阵及冲突测试通过 |
| P4 收口 | 全 DTO/OpenAPI、一致性/容量、Bun 与 Node 网络旅程、部署前说明和安全初始化文档 | 全范围验收、实际覆盖率、独立审查问题清零、假绿抽查 |

P1 正式旅程：离线初始化超管 → 登录 → 创建编辑角色及 articles 权限/绑定 → 邀请并激活编辑者 → 登录 → 正式集合创建草稿 → 无发布权拒绝 → 超管授予发布权 → 下一请求发布成功 → 撤权后拒绝 → 注销后旧令牌拒绝。此旅程与全局 implementation-plan.md 的内容切片联合交付；用户/RBAC文档不另行实现内容引擎。

如果先单独验证身份/RBAC 基础，可通过账户/角色读取这一真实生产操作完成更小探针；它不能取代 P1 内容范围旅程，也不能将未实施内容替身报告为完成。P1 已交付代码继续演进，不推倒重写。

## 5. 工程门禁与覆盖率

纯方案阶段仅核对文档内容、引用和格式；不运行四项工程门禁，不引用历史测试数字作为本轮结果。

业务代码批次必须扩展实际 package.json 后执行：lint（架构/owner + 类型感知 Oxlint 0/0 + Oxfmt）、typecheck、Node API build、test（单元/真实 DB/覆盖率/Bun及Node冒烟）。本期没有 UI，Next.js 构建/浏览器页面不冒充后端验收；未来 UI 批次再按 AGENTS 加入对应门禁。

当前 coverage 仅含 tooling/oxlint-plugin，阈值 statements 90%、branches 85%、functions 90%、lines 90%。实施时保留该范围及门槛，另显式纳入本期 CMS/API/数据库业务可测代码；不得把 SQL/HTTP/适配器等运行逻辑藏进 exclude。业务门槛初始同为 90/85/90/90，并分别报告每个配置范围与四项实际数字。生成物仅按实际可重复生成边界排除，不排除手写规则。

新增 test:e2e 为真实统一入口，支持按 e2e 文件选择，Bun/Node 旅程都必须进入门禁；依赖缺失应失败，不能 passWithNoTests、条件 skip 或仅报告工具测试通过。每批四门后做独立对抗审查，修正后重跑受影响及必要全门；不反复扩大无关测试。

## 6. 发布、兼容窗口与回滚

本项目没有存量业务数据，初次实现不需要导入 Tillgate，不建兼容 alias、双收参数或两套会话。数据库迁移先行，应用核对迁移/操作目录兼容通过才 ready；不在 API 启动中执行 DDL。

滚动兼容窗口为一次发布内“新旧受支持产物同时存活”的明确窗口；发布清单必须列出两个版本及目录/迁移兼容范围。操作目录新增只增不删；旧实例全部摘流且在途请求/任务排空、最大 15 秒请求期限过去、旧产物不再接流量后，发布命令方可删除退役操作及无引用结构。监控 ready 拒绝、无绑定 403、授权失败、版本冲突、安全锁等待、连接占用、投递 unknown 与幂等冲突；指标不使用用户/资源 ID 高基数标签。

每批可独立回退代码产物，保留兼容的新增表/列；已有账户/审计不得为回滚删除。安全授权一旦撤销，回滚不能恢复旧授权快照；回退产物必须仍读当前 writer 和安全表。如果数据库出现破坏性变化，另行定义备份、回填、验证、切换、删除条件与恢复演练，不执行无数据保留的 down。初次上线前无业务数据时才能在明确隔离环境重建测试库。

令牌已提交、响应丢失时：登录可再次登录并受会话上限限制；密码消费不自动重放，通过新登录或重新申请恢复；账户/邀请管理写按幂等键查询原结果。邮件不因产物回退自动重发。用户部署和发布授权仍单独取得；Git 初始化/远端不在本轮擅自决定。

## 7. 方案独立审查与处置

2026-10-25，由独立上下文 review_user_rbac_plan 只读三件套及必要引用，按“假设方案是错的”审查契约、越权、并发、投递、生命周期及验收。审查者未修改文件、未执行业务或工程测试。

| 编号 | 发现及触发场景 | 处置及复核 |
| --- | --- | --- |
| AR1 / P1 | 普通改密后旧password_reset token未明确撤销，持旧链接者可能再次覆盖新密码 | 设计§7及单元§5明确改密/重置/激活、禁用/归档、角色分配同事务撤销其余未终结token；I3补旧链接失效矩阵；独立复核关闭 |
| AR2 / P2 | 2000→2000全量授权替换差异约156KiB，超过初稿32KiB审计上限，合法操作因审计失败整体回滚 | 审计预算统一256KiB，仅存added/removed UUID及计数；A1补最大差异完整落库验收，不截断、不减授权容量；独立复核关闭 |

最终复核未发现其他可确认问题；这只表明设计审查发现已处置，不代表业务实现、安全测试或容量已验证。三件套保持草稿，供用户评审；本轮不自动进入实现。

## 8. 验收清单

方案阶段：

- [x] 用户 U1/U2/U3、既有基线与本轮建议分别记录。
- [x] 当前代码/测试/工具事实与后端目标分开。
- [x] 表所有权、接口/错误、副作用时序、并发预算及越权矩阵明确。
- [x] 三件套完成独立审查，2项发现均修正并经独立复核关闭。
- [x] 本地链接、围栏、表格、操作身份唯一性及跨文档裁决一致性核对完成。

业务实施阶段，当前均未执行：

- [ ] 每个接口及状态转换、scope/最后超管/单次消费并发验证。
- [ ] 所有源参考场景按新契约核销，真实 PostgreSQL 回滚与约束验证。
- [ ] 四门、匹配范围、用例数及四项覆盖率实际记录。
- [ ] Bun/Node 网络 e2e、邮件不确定性及取消/容量/退出恢复。
- [ ] 假绿抽查：无 skip、无断言弱化、无缩小范围或降阈值。
- [ ] 实现期独立审查清零、所有权/公开导出/相关文档同步。
- [ ] Git 与远端明确后仅提交自己的点名文件，满足用户条件再 push；无部署冒充。
