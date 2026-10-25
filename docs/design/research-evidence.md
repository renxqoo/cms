# 架构研究与来源

核对日：2026-10-25。近期窗口：2026-07-25 至 2026-10-25。文章日期取正文发布日期，仓库日期取 GitHub commit 的提交时间；搜索引擎的 crawl 日期不作为新资料证据。仓库近期活跃不等于其整个架构在近期产生。

## 1. 最近三个月的官方 AI 工程资料

| 日期 | 原始来源 | 对本项目的启示与边界 |
| --- | --- | --- |
| 2026-08-03 | OpenAI：[Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex) | 逐步保存决策和可运行验证；示例文件树是可选工作约定，不能照搬为强制框架 |
| 2026-09-11 | OpenAI：[Rethinking skills and prompts](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | 定期删减重复、冲突和过时指引，明确适用范围；不因此更换用户模型或技术栈 |
| 2026-10-15 | Anthropic：[How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/) | 短规范指向详细规则，可运行证据、具体失败模式、按风险分配人审和有限复审；不以代码生成量证明质量 |
| 2026-08-12 | Cursor：[AI code review: more context, fewer bugs](https://cursor.com/guides/ai-code-review) | 审查需要仓库、测试和近期变更上下文；补充 CI，人保留架构/业务风险判断 |
| 2026-08-13 | Cursor：[Cloud agents start 3x faster with builds](https://cursor.com/blog/builds) | 可重复开发环境和准确 commit 记录；这是产品环境机制，不是 CMS 应照搬的应用架构 |

`claude.dev` 的官方归属由 [claude.com](https://claude.com/) 的 Developer blog 链接交叉确认。当前 [Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices) 和 [Codex AGENTS 指引](https://developers.openai.com/codex/guides/agents-md) 用于核实工具行为；没有可核实发表日期的持续更新文档不标作近期文章。

共同落点是可检验的边界、可信上下文和反馈速度。三家没有规定一个适用于所有 coding agent 的企业应用目录；本项目的目录与事务设计是结合业务约束的工程判断。

## 2. 成熟开源产品的源码快照

以下均核对真实源码和提交时间，使用固定 commit 链接，不依靠项目宣传或 stars 排名判断质量。借鉴边界及行为，不复制完整包树或代码。

| 项目、提交日期 | 核对入口 | 采用与不采用 |
| --- | --- | --- |
| Hono，2026-10-25，`bac5c4a`，MIT | [源码](https://github.com/honojs/hono/tree/bac5c4a8bcd76b165428ce757e1185753c7935bd)、[官方架构建议](https://hono.dev/docs/guides/best-practices) | 路由组合、薄协议适配；不能把全部业务规则堆进 handler，也不照搬失去类型推断的 controller 模式 |
| OpenStatus，2026-10-24，`bab71c8`，AGPL-3.0 | [Node/Hono 服务说明](https://github.com/openstatusHQ/openstatus/blob/bab71c8b93d15d2363217ee5eba6f9eaabb408d1/apps/server/AGENTS.md)、[服务边界](https://github.com/openstatusHQ/openstatus/blob/bab71c8b93d15d2363217ee5eba6f9eaabb408d1/packages/services/AGENTS.md)、[真实入口](https://github.com/openstatusHQ/openstatus/blob/bab71c8b93d15d2363217ee5eba6f9eaabb408d1/apps/server/src/index.ts) | Node/Hono 产品而非示例；写能力内部校验、事务与审计协同、装配时解析配置、逐步用 lint 收紧边界。其多传输入口不是本项目必需 |
| Payload，2026-10-23，`aebbf75`，MIT | [create endpoint](https://github.com/payloadcms/payload/blob/aebbf75b93e218be4b53a3c7922e0bc82924830b/packages/payload/src/collections/endpoints/create.ts)、[operation](https://github.com/payloadcms/payload/blob/aebbf75b93e218be4b53a3c7922e0bc82924830b/packages/payload/src/collections/operations/local/create.ts)、[自定义 Oxlint 规则](https://github.com/payloadcms/payload/blob/aebbf75b93e218be4b53a3c7922e0bc82924830b/packages/oxlint-plugin/customRules/no-relative-monorepo-imports.js) | 配置式集合、端点到用例可追踪、核心与适配器边界、架构规则机械检查。其包数量对应真实发布边界；不复制 PayloadRequest 或假定旧版本的权限默认值。此快照 local create 的 overrideAccess 默认 false |
| Medusa，2026-10-23，`029fb31` | [产品 API](https://github.com/medusajs/medusa/blob/029fb31fd077ab9c6d6fd9d68c676c17c71294c7/packages/medusa/src/api/admin/products/route.ts)、[AGENTS](https://github.com/medusajs/medusa/blob/029fb31fd077ab9c6d6fd9d68c676c17c71294c7/AGENTS.md)、[许可证](https://github.com/medusajs/medusa/blob/029fb31fd077ab9c6d6fd9d68c676c17c71294c7/LICENSE) | 明确公共能力、HTTP 到工作流、模块迁移与测试约定；不引入其完整 DI/补偿框架。本 CMS 可用本地事务；仓库有 enterprise 例外，不能笼统称全仓 MIT |
| Logto，2026-10-24，`74a09af`，MPL-2.0 | [角色查询](https://github.com/logto-io/logto/blob/74a09af299082bd139c61bcba587091c8d06607d/packages/core/src/queries/roles.ts)、[角色路由](https://github.com/logto-io/logto/blob/74a09af299082bd139c61bcba587091c8d06607d/packages/core/src/routes/role.ts) | 角色、授权与查询连接的明确边界；不因成熟项目部分校验位于路由就放弃本项目用例入口授权 |

这些许可证是参考快照的事实，不是对本项目许可证的选择。采用思想和独立重写功能，不代表可以忽略实际复制代码时的许可义务。

## 3. 近期真实缺陷对架构的约束

| 提交日期 | 证据 | 应验证的场景 |
| --- | --- | --- |
| 2026-08-06 | [Graphile Worker 队列领取并发修复](https://github.com/graphile/worker/commit/32f4258e9208cc89b4e1386c66691c05ce525424) | 多消费者领取、队列串行范围、过期 owner 恢复，不以“使用了锁”代替证明 |
| 2026-10-05 | [pg-boss 并发 singleton upsert 修复](https://github.com/timgit/pg-boss/commit/bc59459a672341af99a66cad17a113c2d40e8490) | 任务唯一性与业务幂等分别验证，外部邮件仍可能重复 |
| 2026-10-13 | [Hono Node HTTP/2 reset 信号修复](https://github.com/honojs/node-server/commit/1b6e6bfc21f0f018d5725b8bd8f5a230680e2134) | 真实 Node 客户端取消、流中断与资源释放，不能只测内存 Request |
| 2026-08-13 | [Directus 取消资产请求时存储连接泄漏修复](https://github.com/directus/directus/commit/234bac2f9f66524b27613ff08bef1d957dce15d3) | 中止下载后存储连接、文件句柄和并发容量恢复。Directus 作为源码可见的补充案例，不混同为本清单的宽松开源许可项目 |

## 4. 开发者、论坛与 X

- **2026-10-13** [Hacker News 原讨论](https://news.ycombinator.com/item?id=50073633)：日期由 HN item API 时间戳核实。围绕自动化审查、失效模式和超大规模工具的争论，提醒我们不能把一家大型 AI 实验室的源控重建当作小型 CMS 必需架构。论坛意见不能证明某项安全机制正确。
- **2026-10-13** [Simon Willison 的独立实践记录](https://simonwillison.net/tags/agentic-engineering/) 描述对抗审查的作用及过度工程倾向。采用可复现反例与有界复核；页面为日期明确的条目合集，不以合集抓取时间冒充发布日期。
- **2026-09-29** [Martin Fowler 的评论](https://www.martinfowler.com/fragments/2026-09-29.html)：AI 工程仍需要纪律和知识；不把观点当作实验证据。
- **2026-09-22** [Boris Cherny 的 X 原帖](https://x.com/bcherny/status/2102543349102338309)：正文和时间通过 Tavily 提取核实，普通网页工具直接访问受限。形式模型可寻找竞态反例，但须回到真实实现复现。第一阶段不把 Lean/TLA+ 设为所有 CRUD 的必备工具；高风险并发协议反复出错时再采用。帖子的模型与效果数字不作为本项目选型依据。

## 5. 稳定的软件系统依据

- Parnas，1972：[模块划分原论文的高校转载](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html)，按应隐藏的设计决策划分，非按执行步骤机械分层。ACM 入口本轮访问 403，引用可读取的原文转载并保留其转录声明。
- Fowler，2015：[Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)，先验证领域边界，明确微服务带来的协调成本；这是经验讨论，不是所有项目必须单体的定理。
- PostgreSQL：[事务锁](https://www.postgresql.org/docs/current/explicit-locking.html)、[同步/异步复制](https://www.postgresql.org/docs/current/warm-standby.html)、[故障切换](https://www.postgresql.org/docs/current/warm-standby-failover.html)、[PITR](https://www.postgresql.org/docs/current/continuous-archiving.html)。数据库提供能力，但授权锁范围与文件恢复协议仍由应用设计。
- node-postgres：[多实例连接预算](https://node-postgres.com/guides/pool-sizing)；Node：[HTTP 与退出](https://nodejs.org/docs/latest-v24.x/api/http.html)；[Drizzle 事务](https://orm.drizzle.team/docs/transactions)。当前官方文档核实行为，不标注未经证明的近期发布日期。

采用结论及权衡已落实到 [架构基线](architecture.md)。研究范围覆盖近期官方实践、产品源码、具体修复与社区反例；不宣称穷尽全部项目，也不按文章新旧替代原理与测试。

本地 /Users/wrr/work/payload 的深入核对见 [Payload 架构分析](payload-architecture-analysis.md)：记录本地 commit、实际调用链，以及 2026-08-17 事务修复和 2026-10-07 文件版本化变更如何影响本项目设计。
