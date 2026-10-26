# CLI/MCP 单元契约与验收矩阵

状态：已实施，契约与本地验收已核销；Git 交付待完成。

## 0. 新增业务 HTTP 契约

统一 Grant 为 `{operationId: string, scopeKind: 'global' | 'collection', collectionKey: string | null}`，只接受真实注册操作和匹配范围。Credential 为 `{id, kind: 'api_key' | 'oauth', name, prefix: string | null, clientId: string | null, clientName: string | null, resource: 'api' | 'mcp', grants: Grant[], createdAt, expiresAt, revokedAt: string | null, lastUsedAt: string | null, status: 'active' | 'expired' | 'revoked'}`。时间为 UTC ISO 字符串，服务端计算状态。

| operationId | HTTP | 输入 | 结果 |
| --- | --- | --- | --- |
| credentials.list | GET /v1/me/credentials | page/pageSize，kind 可选 | 标准 rows/total/page/pageSize |
| credentials.createKey | POST /v1/me/api-keys | name、expiresAt、grants | 201 `{credential, apiKey}`，秘密仅本次返回，不自动重试 |
| credentials.revoke | DELETE /v1/me/credentials/:id | id | 204，重复撤销幂等，非可管理记录 404 |
| credentials.revokeClient | POST /v1/me/oauth-clients/:clientId/revocations | clientId | `{revoked: number}`，限本人可管理子树 |
| credentials.getAuthorization | GET /v1/oauth/requests/:requestId | requestId | `{id, clientId, clientName, redirectUri, resource, scopes, expiresAt, availableGrants}` |
| credentials.decideAuthorization | POST /v1/oauth/requests/:requestId/decisions | requestId、approved、grants、name 可选 | `{redirectTo}`，仅已验证回调地址 |

以上为 authenticated 全局操作；创建、同意授权仍检查当前权限和父委托，不能因 authenticated 直接授予能力。控制面最小发现为 access.me/access.myOperations/collections.list/resources.list，聚合结果过滤；其他 authenticated 操作同样受委托白名单限制。除公开认证流程外，各客户端均有上述操作映射。

协议入口为 GET /.well-known/oauth-authorization-server、GET /oauth/authorize、POST /oauth/register/token/revoke/exchange、GET /oauth/userinfo。scope 支持 cms 和 offline_access，cms 表示用户在同意页面选择且当前允许的操作上限，不表示通配授权。CLI client_id 为 cms-cli，公开 API resource 使用配置 issuer，MCP 使用配置的完整 /mcp URI；默认 scope=cms，refresh 仅在授予 offline_access 时签发。bridge 仅 POST /oauth/exchange，Authorization 携带 MCP 凭据，X-CMS-MCP-Secret 携带桥接密钥；输出标准 access_token/token_type/expires_in/scope，并绑定原委托与 api 受众。MCP resource metadata 的 authorization_servers 指向同一 issuer。

## 1. 身份与授权

- 本人 Key 创建/分页/撤销，跨账号 ID、已过期、重复撤销、伪造摘要和碰撞字段；列表不返回秘密。
- 主体矩阵：浏览器会话、CLI OAuth、MCP OAuth、MCP Key、桥接 token；账号 active/disabled/archived、角色 active/disabled、超管/普通角色；grant 允许/拒绝 operation/global/collection，未绑定和已移除操作默认拒绝。
- 创建后角色升权不扩大授权数组；收权即时生效；子凭据不能超过父范围/到期/深度；父撤销使子失效。
- 集合目录、资源目录、myOperations、媒体关联、跨集合复制、批量和定时任务不能绕过委托；任务在 token 到期后继续，在授权撤销后拒绝未提交项。
- 写事务和撤销并发：已持锁操作可先提交，撤销提交后开始的操作必须拒绝；两 API 实例读取相同事实。

## 2. OAuth

- 正常 PKCE、拒绝授权、state 与 iss、未知 client、非法/重复 redirect、非 HTTPS、loopback 动态端口、未知 scope、缺 verifier、plain challenge、错误 challenge/resource/client、授权请求和码过期。
- 同码双兑换只能成功一次；同 refresh 并发最多一个成功，重放使整族失效；refresh 不能加 scope、换 resource 或延长委托。
- DCR 严格元数据、public client、容量、长度、重复字段；metadata/resource discovery/WWW-Authenticate 精确契约；不抓取不可信 URI。
- protocol form/JSON 媒体类型、重复参数、超限、未知字段、404/401/403、错误 redirect 不产生开放重定向；接口和日志不泄露秘密。

## 3. HTTP 客户端与 CLI

- 实际注册 operation 集合与生成描述、CLI、MCP 映射双向一致；不是照抄静态表断言自身。
- path 安全编码；where/sort/select/fallback JSON、folderId=null、重复 query/DELETE version；输入错误、空页、分页与 maxPageSize；API 403/409/429/5xx 和 CMS requestId/code 保留。
- 子进程验证 SDK 参数、stdin/文件输入、stdout/stderr 和退出码；登录的随机端口、state 错误、取消、超时关闭；多 origin/profile 凭据隔离、0600/0700、原子存储及双进程刷新。
- 原始字节上传/下载逐字节对照，包括非 UTF8、零字节、上限两侧、断流取消；幂等键重试不改变；非幂等网络失败不盲重试。

## 4. MCP

- 官方 Client 对远程 Streamable HTTP 执行当前协议直接 list/call 和旧版 initialize/list/call，另以原始请求验证逐请求元数据/版本拒绝，Key 与 OAuth 两条链；metadata 和 401 challenge；错误工具名、输入、超限、取消、未知 resource。
- 多账号并发、同账号不同 Key、工具列表/调用 scope、Key 撤销、token 受众错配、未认证桥接、伪造 actor 头；不共享 server/transport 或用户状态。
- 不允许服务端路径和任意外部 URL；base64 严格验证与字节预算，文件内容只在 structuredContent 一份；非法 Origin、预检和暴露头；独立多实例请求无需 sticky session。
- 退出排空、超过并发预算、后端超时/失联和 PG 故障有真实失败，完成后无活动连接/监听/任务泄漏。

## 5. 前端与迁移

- 本人 Key 名称/范围/期限输入、一次性明文、失败重试、列表分页、过期状态、撤销确认；CLI 单次退出和同应用全部退出的隔离。
- OAuth 已登录/未登录回跳、同意/拒绝、过期请求、网络错误；Origin/BFF 不允许跨站提交或任意后端地址。
- 中文/英文、窄屏、键盘焦点和弹窗关闭；Token 不进入浏览器持久存储、URL 或用户可读错误。
- 新 schema 正常迁移、重复迁移、runtime 权限精确授予、readiness；旧会话和已有作业保持原规则，新委托任务持久化来源。

## 6. 收口清单

- [x] 设计审查问题已处理。
- [x] 全部业务操作与字节端点覆盖。
- [x] 权限、撤销、OAuth 并发和双实例旅程通过。
- [x] CLI/MCP 和浏览器真实进程通过。
- [x] 四门通过，覆盖率实数与门禁分别记录。
- [x] 独立实现审查与假绿抽查通过。
- [x] 文档与实际行为一致，未执行部署验证明确标注。
- [ ] 本次变更提交、push、合并 main 并 push main。
