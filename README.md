# New CMS

面向结构化内容、文件资料和 RBAC 管理的自研 CMS。后端采用 Hono、PostgreSQL 和 Drizzle；开发与脚本使用 Bun 1.4.4，生产使用 Node.js，测试使用 Vitest。

当前交付为架构设计和代码规范工具。CMS HTTP 接口、数据库迁移及前端 UI 尚未实现，不存在可启动的业务服务。

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

## 当前工具验证

使用 Bun 1.4.4 安装并运行：

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
bun run test
```

当前 build 仅生成 Node 目标的 Oxlint 插件；test 覆盖插件和规范预检。它们不代表 API、Next.js 或数据库集成验证。测试在临时目录创建文件并清理，不需要生产账号、数据库或 Docker。

业务实施采用模块化单体和三个私有工作区，不直接复制参考项目代码。首先建立登录、授权、草稿与发布的完整垂直切片，再扩展全部接口，最后实施 UI。实际贡献、发布和安全报告流程随可运行工程建立，不提供不存在的服务命令或联系方式。
