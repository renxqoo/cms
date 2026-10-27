# 编辑会话的客户端传输

编辑租约由主体、委托凭据、文档、逻辑语言、编辑会话 UUID 和 generation 共同约束。客户端先通过 `documents.acquireLock` 使用 `editorId` 取得租约，再将同一 UUID 作为请求上下文传给后续文档写入和资产上传/处理请求；心跳和释放仍使用操作输入中的 `editorId`、`generation` 和语言。

TypeScript SDK 的逐调用 `CallOptions.editorSessionId`、CLI JSON 外层的 `editorSessionId` 和 MCP 工具参数的可选 `editorSessionId` 统一映射到 `x-cms-editor-session` HTTP 头。它不属于文档字段或操作 body，不写入登录配置，不使用跨请求默认值，也不从任意外部头或参数推断。MCP 在调用业务 SDK 前移除该传输参数，保留操作输入的严格 schema。工具没有编辑会话时仍可正常调用。

三种客户端复用 SDK 的公开 UUID schema，在发请求前拒绝无效、空值、nil UUID 和控制字符。SDK 统一小写传输；调用方可以为并行文档和多个标签分别指定 UUID。没有上下文的写请求依旧由服务端租约规则决定是否允许，不能因为由 CLI 或 MCP 调用而绕过租约。

同一 UUID 不能替代身份认证。服务端重新检查当前账户、角色、委托链和租约的所有权；另一个委托凭据不能借用会话 UUID 续写或释放，撤销凭据立即生效。取消与超时继续沿用现有 AbortSignal 和客户端生命周期清理，不增加后台心跳或隐藏定时器。

本次只补请求上下文，无数据库迁移或兼容窗口。回滚客户端不更改持久化租约，但无法携带其拥有的编辑会话写入；应先显式释放租约或等待到期。观测沿用实际操作请求的错误码、requestId 和租约状态，不输出认证令牌。完整过程使用真实 API、独立 CLI 进程和 MCP 进程验证。

操作参数继续来自唯一的生成 JSON Schema。SDK 和 MCP 共用 `compileInputSchema`，把对象 schema 的 required-only `anyOf` 展开为完整对象分支，确保当前解析器能同时检查公共字段类型、未知键和至少一种更新输入。其它 schema 保留原生解析，不替换依赖或引入第二套操作声明。
