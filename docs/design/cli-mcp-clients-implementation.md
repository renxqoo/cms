# 公共 HTTP client、CLI 与 MCP

## 归属与生成

`packages/api-client` 只包含生成的静态操作描述、输入检查及 HTTP 传输，不依赖 CMS、database 或运行时 OpenAPI。`tooling/generate-api-client.ts` 在构建期消费真实 `applicationOperations`、identity/access/content/assets 输入 schema 和应用限额；`client:generate` 更新产物，`client:check` 检测漂移。命令、工具、路径与方法的双向一致性由独立的实际操作目录测试验证。

`apps/cli` 和 `apps/mcp` 均通过 client 调用业务 API。公共身份流程保留 CLI 命令映射；MCP 不发布公开登录、邀请与密码恢复操作。MCP 的最小发现工具为 access.me、access.myOperations、collections.list、resources.list，公共身份 CLI 命令不读取或发送已有 token。其余工具按 API 返回的有效操作目录过滤；调用时 API 再次授权。

## CLI

采用 npm 稳定 `@renxqoo/agent-cli-sdk` 1.0.2 的 `defineCli`、`defineCommand`、插件和 `beforeRequest` 扩展点。命令由 operationId 的两段组成，驼峰转换为连字符，例如 `assets download-binding`。业务参数采用 SDK 原生整文档 JSON 模式，支持 `--input`、`--input-file` 和 stdin：

```sh
CMS_API_ORIGIN=https://api.example cms auth login
CMS_API_ORIGIN=https://api.example cms documents list --input-file request.json
```

请求文档为 `{ "input": { "collection": "articles", "folderId": null }, "idempotencyKey": "..." }`。只有要求幂等的操作需要 idempotencyKey；创建 Key 不自动重试。上传额外提供 `file` 本地路径；下载额外提供 `output` 路径，拒绝覆盖现有文件。下载 stdout 仅报告文件元数据。文件读取、响应读取和原始字节传输都受配置上限约束。

CLI OAuth 固定 client_id=cms-cli，授权码、S256 PKCE、scope=cms offline_access、resource=API origin。回调只监听 127.0.0.1 随机端口的 /callback，验证 state、iss 和重复字段；超时、取消和完成都关闭监听，并终止尚未退出的浏览器启动器；启动器采用 SDK BrowserOpener 接口及有界 Node 子进程，不等待其退出才处理回调。token/revoke 用表单 client_id，不发送 Basic。

`CMS_CLI_PROFILE` 默认为 default，`CMS_CLI_STATE_DIR` 默认为 ~/.cms。状态按规范化 origin 与 profile 的 SHA-256 标识分目录；目录 0700、文件 0600、临时文件原子替换。登录落盘、refresh 与 logout 共用独占锁。refresh 在锁内重新读取状态，避免两个正常进程使用同一个 refresh token。锁等待受 CMS_CLI_TIMEOUT_MS 上限约束，取消可提前中断。死进程或损坏锁明确拒绝，并提示移除对应锁后重新登录；不会自动删除可能已被其他进程替换的锁。`CMS_ACCESS_TOKEN` 可提供面向 API 的短期 token；它启用时 auth login/logout 拒绝管理被覆盖的本地登录，需先移除该环境变量。auth status 返回凭据来源和本地快照，实际有效性仍由 API 校验。SDK 通用 `--api-key` 选项被明确拒绝，因为个人 Key 的目标为 MCP，不能静默改用已保存的更大身份。

SDK 默认错误序列化白名单不包含 CMS requestId。项目通过公开 BareError 退出接口输出一次结构化 stderr，保留 CMS code、requestId、HTTP status，并使用参数 2、认证/授权 3、网络 4、API 1 的退出码。成功数据仍由 SDK 输出 stdout envelope。普通网络错误不重试；401 仅在锁内刷新一次，保持同一输入、文件字节和幂等键。

CLI 配置：CMS_API_ORIGIN、CMS_CLI_PROFILE、CMS_CLI_STATE_DIR、CMS_CLI_TIMEOUT_MS、CMS_CLI_LOGIN_TIMEOUT_MS、CMS_CLI_FILE_LIMIT_BYTES、CMS_CLI_RESPONSE_LIMIT_BYTES、CMS_ACCESS_TOKEN。非回环服务要求 HTTPS，拒绝 origin 中的用户信息、路径、query 和 fragment。

## 远程 MCP

采用官方 npm 稳定 `@modelcontextprotocol/server` 2.4.0、`@modelcontextprotocol/node` 2.1.2。官方 server 包导出 createMcpHandler、isLegacyRequest、WebStandardStreamableHTTPServerTransport；node 包导出 toNodeHandler。现代入口使用 createMcpHandler，2025 协议经官方无状态 transport 并启用 JSON 响应。二者调用同一个工具 factory，每请求新建 server/transport，完成后关闭。

SDK 的默认 SUPPORTED_PROTOCOL_VERSIONS 仅列旧版，因此实例显式追加 2026-07-28。现代请求同时验证 `_meta` 协议、MCP-Protocol-Version、Mcp-Method 等元数据；旧协议支持 initialize/list/call。官方 client 2.4.0 以 legacy 和固定 2026-07-28 两种模式执行真实 Node 进程旅程。

每次受保护请求将原始 Bearer 与 X-CMS-MCP-Secret 交给固定 API 的 POST /oauth/exchange，业务请求只使用交换得到的 API token。bridge secret 没有账号身份，不从请求中接受 actor 或任意上游地址。metadata 和 401 challenge 只声明 cms，不声明 offline_access 为资源必需权限。

工具上传只接受严格 canonical base64，拒绝本地路径和任意 URL。下载内容只在 structuredContent 的 `{encoding,data,mimeType,filename,bytes}` 返回一次，content 只含元数据。错误返回 isError 和结构化 code/requestId/status。

Origin 精确匹配配置白名单；支持授权头、协议元数据和 Mcp-Param-* 预检，暴露 WWW-Authenticate 与协议版本。Node Host guard 保护入口。实例在读正文前按 Content-Length 或最大正文预留字节预算，并预留响应预算；流读取再次检查上限，finish/close 释放准入。并发、字节、超时和退出排空有界。/healthz 表示进程存活，/readyz 通过 API /readyz 检查真实后端契约。

MCP 配置：CMS_API_ORIGIN、CMS_MCP_RESOURCE、CMS_MCP_BRIDGE_SECRET、MCP_HOST、MCP_PORT、MCP_ALLOWED_ORIGINS、MCP_ALLOWED_HOSTS、MCP_BODY_LIMIT_BYTES、MCP_FILE_LIMIT_BYTES、MCP_RESPONSE_LIMIT_BYTES、MCP_IN_FLIGHT_BYTES、MCP_CONCURRENCY、MCP_REQUEST_TIMEOUT_MS、MCP_SHUTDOWN_TIMEOUT_MS、MCP_OPERATION_PAGE_LIMIT。默认值与设计预算一致；进程准入不替代 API 中共享 PG 鉴权和限流。

## 验证

完整 lint/typecheck/build/test 通过；全仓单元 281 文件、2531 用例，覆盖率及门槛见[总验收记录](cli-mcp-implementation.md)。生成操作为 82 项，与真实注册操作、CLI 映射和已授权 MCP 工具目录的双向契约校验通过。

默认进程门共 14 用例，其中 `cli-mcp-transport.spec.ts` 4 例使用受控协议上游验证真实 CLI stdin/file/错误出口、官方 Client 新旧协议、多账号隔离和跨进程刷新；`cli-mcp-api.spec.ts` 2 例使用真实 PostgreSQL、Node API/CLI/MCP 验证 PKCE、文档写入、重启、两个 API/MCP 副本、RBAC 和撤销。没有以协议替身代替真实业务链。

独立审查复核公共操作未登录可调用、无凭据转发，环境覆盖下拒绝误导的 profile 管理、登录/刷新身份交错、锁等待上限以及 launcher 期限/取消/真实 PID 回收。对抗变异移除回收、提前等待启动器，均触发回归失败。MCP 逐请求协议元数据错误、Key/OAuth 受众及跨账号隔离均按实际失败断言。公网客户端连接和实际生产容量留给部署验收。
