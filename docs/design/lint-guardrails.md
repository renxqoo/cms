# Coding agent 静态约束

状态：已实现代码规范工具及身份/RBAC阶段的导入边界检查；静态规则不代替业务验证。

## 1. 影响面与单一工具链

保留用户已有复杂度、文件规模、React、TypeScript 和 oxfmt 策略，增强 `.oxlintrc.json`。新增根 package/锁文件、严格 TypeScript、Vitest、tooling/oxlint-plugin 和真实 CLI 测试。没有引入 ESLint 或平行格式系统。

bun run lint 依次执行不可通过行内注释关闭的指令预检、禁止嵌套配置覆盖的类型感知 Oxlint、oxfmt；警告导致失败。bun run typecheck使用用户确认的bun check检查工具/业务/测试；build生成Node API、命令和插件，test在Bun1.4.4下运行Vitest/Istanbul及真实数据库、Bun/Node网络旅程。

AGENTS.md 维护项目规则及目录导航，保留原有排版，.oxfmtignore 精确排除该文件的格式处理。原有 .oxfmtrc.json 不变，源文件格式检查不排除。文档目录继续沿用用户原有格式排除。

## 2. 原生规则优先

- 拒绝 any、不安全赋值/调用/成员访问/返回/参数、非空断言及压制 TypeScript 错误的注释。
- 未处理或误用 Promise、无效 await、遗漏分支、eval/debugger、循环依赖均作为错误。
- Vitest 禁止 skip/only/todo、前缀禁用用例及 node:test；生产后端源码禁止 Bun 全局与 bun/bun:* 导入，测试使用 Vitest。
- no-console 从 warning 改为 error，保留用户允许 warn/error 的原策略。
- Vitest valid-expect 配置 maxArgs=2，匹配 Vitest 支持的断言诊断消息参数，不关闭断言合法性检查。

## 3. 最小自定义规则

| 规则 | 实际执行范围 |
| --- | --- |
| cms/no-code-comments | 由 Oxlint AST 识别代码注释，字符串/正则中的注释文字不误报；设计理由放文档 |
| cms/workspace-boundaries | 读取 apps/*、packages/* 实际 package.json；跨 workspace 禁止相对路径/绝对路径私入，只接受显式 exports；禁止 packages 依赖 apps |
| cms/architecture-boundaries | 检查HTTP不得导入数据库/composition/SQL平台能力、identity不能反依赖access、platform/database不能依赖业务、跨模块公开入口及schema owner导入；pure contracts例外明确允许 |
| cms/private-tests | 阻止生产代码和其他模块测试导入 __test__ 私有文件，同一私有测试目录内可复用；共享装置用 test/support |

导入检查包含 static import、export from、字面量动态 import、TypeScript import type 表达式。计算动态 import 拒绝。Oxc 官方 resolver 解析真实目标、TS paths 及符号链接；跨工作区别名也必须改用明确的包出口，file URL 不作为逃逸路径。exports 支持明确子路径及根条件出口，不接受 wildcard 扩权。工作区测试可引用根 test/support，业务不能借此导入工具或测试实现。配置变更需有绕过测试，lint 不防护恶意改写工具配置。

官方 Oxc parser 另作行内 oxlint/eslint disable/enable 指令预检，避免注释规则被该注释自身关闭；不是另造解析器。工具配置、锁文件及 CI 必须纳入人审，lint 不是对可任意修改仓库者的安全沙箱。

测试目录额外用原生 no-restricted-properties 禁止 skipIf/runIf，包括别名对象及字面量计算属性；不能用条件跳过制造通过。编程计算属性属于审查范围，不宣称静态规则能证明任意元编程测试实际执行。

细粒度领域 DAG、schema owner 白名单、HTTP 禁止 composition/database/SQL 平台能力、外部适配器依赖方向等目标约束见 [代码组织约定](code-organization.md)。首个垂直切片需同步加入规则及合法/违规样本；操作目录一致性使用真实 Hono 行为测试。本期已有实际业务文件及合法/违规AST样本；raw SQL所有权仍依赖真实查询清单与独立审查，不能由schema导入规则外推证明。

## 4. 测试与有限例外

Vitest 通过官方 oxc-parser 的真实 AST 驱动公开插件规则，另以真实 Oxlint CLI 验证加载、合法输入、违规诊断与类型感知生效。临时 workspace 使用真实 manifest/exports，测试不靠复述配置对象获得绿灯。

已安装 Oxlint 的官方 RuleTester 实际在 Bun 报错“不支持 other runtimes”。为保持用户要求的 Bun 测试运行时，测试专用 rule-harness.ts 使用两个 SDK 类型桥接断言；仅此文件例外关闭 no-unsafe-type-assertion，生产及其他测试维持原规则。真实 CLI 测试负责确认桥接器与实际 Oxlint 接缝一致，不以桥接器测试替代 CLI。未修改 SDK 或伪造运行时检测。

当前覆盖率同时匹配tooling/oxlint-plugin、packages/*/src及apps/api/src的全部手写TypeScript，排除__test__；全局及原插件范围分别保持statements/functions/lines90%、branches85%。具体数字见本轮记录，不外推未实施模块或SQL迁移的行覆盖。指令预检另有行为测试。

工具不证明业务授权、事务竞态、资源释放、代码无占位或接口符合需求；这些必须通过真实数据库、Node 网络测试与审查。禁止用“能 lint”推断“安全”。

本轮最终执行结果与覆盖率见 [审查及验证记录](review-log.md)。尚未实现的内容/资源、Next.js及浏览器页面冒烟不计为通过。
