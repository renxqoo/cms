# CLI、远程 MCP 与访问凭据设计

状态：已实施，本地验收通过，2026-10-27。大型新功能，沿用 feature-dev-v2；设计基线、施工图、单元验收三件套随代码维护。

## 1. 用户裁决与范围

用户裁决：apps/cli 使用 @renxqoo/agent-cli-sdk；apps/mcp 为远程 HTTP 服务，同时支持个人 API Key 与 OAuth；复用现有个人管理员和 RBAC；提供个人凭据管理、单次 CLI 登录吊销和应用全部授权吊销；覆盖 API 全部业务操作。自行查证技术问题，不再请求澄清。使用独立 worktree，验收后提交全部本次变更、push、合并 main 并 push main。部署没有授权。

用户补充裁决：创建 API Key 可配置资源权限，限制 Agent 访问；资源权限编辑器组件化，在 Key 创建与 OAuth 同意页面复用。资源维度沿用系统资源及真实注册集合，操作维度沿用现有 operationId，不引入旁路权限词表。

不新增组织、多租户、服务账号、SSO、密码登录替代入口或独立业务后端。现有浏览器会话是其自身认证方式，继续使用同一授权器。部署拓扑、真实公网客户端授权和实际生产容量由部署阶段验证，本次提供可水平扩展实现、双实例回归和运维约束，不以本地检查声称已部署高可用。

## 2. 存量与影响面

基线有 76 个业务操作；identity 仅持有随机 Bearer 会话；access 按实际 operationId 和 global/collection 范围授权，写入口在事务安全锁下复查。OpenAPI 需 endpoints.list；客户端不能依赖运行时下载全量管理文档。content 作业只记录 actor_id；复制和媒体内部调用可以按 actor 重新授权，新增凭据限制必须贯穿这些路径。

影响公共入口：CMS identity/access/composition、平台主体类型、新 HTTP client 包；HTTP/DTO：凭据管理和 OAuth 协议、操作描述和流式传输；持久化：授权委托、令牌、客户端、一次性授权请求/码、作业来源；配置：公开 issuer、MCP resource、内部桥接密钥、TTL/限额；异步：应用任务复查委托，技术性字节处理与清理仍由所属任务协议负责；前端：个人访问凭据页和 OAuth 授权页；测试：单测、真实 PG、HTTP、CLI/MCP 进程和浏览器旅程。

## 3. 所有权与契约来源

identity 拥有凭据生命周期与协议状态，access 拥有账号当前 RBAC 和委托操作范围判定；跨域能力经 composition 注入，identity 不导入 access。数据库表和迁移在 database。API HTTP 仅消费注入业务 API。CLI/MCP 通过 packages/api-client 的生成操作描述和 HTTP 调用，不导入 CMS/database 实现。生成工具消费真实注册操作和 schema，验证生成物无漂移；不把运行时 schema 可见性提升为管理权限。

每个操作有稳定 CLI 命令和 MCP 工具名。普通 JSON 操作直接映射；二进制上传下载有专用传输适配。认证基础设施和探针分别列入契约清单，不机械作为模型业务工具。静态契约描述不携带凭据和真实业务记录。

## 4. 授权委托

委托关联 owner、类型 api_key/oauth、客户端、名称、resource、创建/到期/撤销/最近使用时间和不可扩大的 operationId + scopeKind + collectionKey 授权数组。Key 的随机秘密仅创建时返回，服务端只存摘要与公开前缀。OAuth access/refresh 令牌和授权码只存摘要。委托和令牌都使用密码学随机字节。

实际允许 = 当前有效账号及角色权限 ∩ 创建时委托上限 ∩ 当前业务资源策略；超管不绕过委托上限。创建事务逐项验证请求 tuple 必须在创建者当时有效操作集内，超界整单拒绝，不能先保存无权 tuple 等待将来升权。新操作不会自动进入既有委托。列表/目录/关系发现、复制、媒体内部访问和作业执行使用相同交集。最小身份发现操作可访问，但其聚合结果仍按委托过滤。创建子凭据不得超出发起者范围或有效期，并保留父委托；父委托撤销使子凭据失效，委托深度有界。

凭据管理仅操作本人记录，所有权在服务端检查，撤销幂等且有审计。浏览器会话可管理本人全量；委托凭据只能列出和撤销当前委托及其后代，按 client 撤销同样限制在此子树，不能读取或撤销祖先/兄弟凭据。一次登录是一个独立 OAuth 委托；撤销它同时使其全部 access/refresh 令牌失效。按 client 撤销不影响其他应用。父链每一层均须未到期、未撤销且 owner 一致，创建和授权均在相同安全锁下检查。子 Key 的目标固定为配置的 MCP resource，是受 credentials.createKey 授权的显式凭据创建；刷新、兑换不得自行换任意 resource。秘密不进入日志、审计、URL、错误、幂等结果或列表 DTO。

content 应用任务、上传会话、会提交文档的资产处理任务保存委托引用；执行和最终提交时复查当前账号和委托，而不是保存短期 access token。access token 正常到期不阻断计划任务，委托到期/撤销会阻断后续项，已提交项不回滚。原始字节清理等系统恢复可以继续以免泄漏资源，但不得因此提交新的业务文档。上传写字节和提交处理同时检查原上传委托及当前调用者；处理任务记录本次提交者的来源，最终提交还复查原上传委托，包括内部内容操作，不能通过浏览器或另一凭据接管已撤销上传。首次将 ready 上传绑定成业务文档时，复查上传源对当前文档写操作的权限；已经提交的文档和清单按当前资源读取/复用权限处理，不追溯撤销历史。本人查询和取消可继续用于恢复与清理。保留原有浏览器任务的无委托来源，不伪造旧任务来源。所有将 Principal 降为 actorId 的媒体、复制和任务入口必须同时传递委托；myOperations/myNavigation/collections/resources 等手工投影按过滤后结果分页和计数。

委托父链使用 ON DELETE RESTRICT，先清理失效子委托再清父委托，不能将子委托变根。任务和上传来源保存不可变 UUID 软引用，清理过期委托不清空此 UUID；授权时必须查到完整有效委托，缺失即拒绝。只有原本由浏览器会话发起的来源为 NULL，不通过 ON DELETE SET NULL 退化为浏览器。这样长期任务历史不会永久阻止凭据状态回收或耗尽登录记录预算。最小发现 allowlist 精确为 access.me/access.myOperations/collections.list/resources.list；myOperations 返回交集并作为资源权限编辑器的可选 tuple 权威；collections 仅提供有权读取的展示标签，元数据不可见时仍可选择已授权的集合 key。collections 的完整 metadata 继续要求 collections.get，resources 和关系发现复查对应读取操作；myNavigation 还需委托有该节点对应权限所绑定的至少一个当前注册有效操作，父容器在子项过滤后裁剪。updateOwnProfile 等其他 authenticated 操作没有隐式豁免。

## 5. OAuth profile

第一期授权码 + S256 PKCE + refresh_token，仅公共客户端，token_endpoint_auth_method=none。不支持 implicit、password、client_credentials。CLI 预注册公共客户端；远程 MCP 支持受限 RFC7591 DCR，使当前主流客户端可注册公共客户端。客户端名称、redirect_uris、grant_types、scope、token_endpoint_auth_method 严格验证，有全局容量和 IP 限流；不抓取客户端提供的 URL，不实现非必要 CIMD 网络取回。

公开 issuer 发布 RFC8414 metadata。authorize 验证 client、redirect、resource、scope、state 和 PKCE 后创建有界一次性请求，转到配置的后台授权页。正常交互经现有 BFF 会话读取请求并提交同意/拒绝；API 层显式允许已获对应操作授权的委托代同意，必须继承当前父链并对所选 tuple 和期限逐项检查，不能借此得到根委托。授权、登录及个人凭据 HTML 响应设置 CSP frame-ancestors none 与 X-Frame-Options DENY，阻止同站跨 origin 点击劫持；POST 使用既有 Origin/CSRF 边界，不向浏览器 JS 暴露会话或 refresh token。前端对已验证回调进行 URL 规范化以支持显式默认端口和主机大小写，仍核对 origin/path/原 query；拒绝和成功回调只使用已验证 redirect，返回原 state 和 issuer；非法 redirect 直接错误，不重定向。已验证回调后的授权请求容量拒绝回调 temporarily_unavailable，保留 state/iss；入口级限流不重定向。loopback 只对原生公共客户端允许动态端口，其主机/路径必须精确匹配；其他 redirect 精确匹配并要求 HTTPS。DCR 显式 web 拒绝 HTTP；未声明应用类型且全部为精确 loopback 回调时归为 native，支持主流桌面客户端。原生 CMS CLI 只接受 127.0.0.1/[::1]；DCR 另外允许精确 localhost（主流桌面兼容），不能泛化为任意本地域名。

token 使用 application/x-www-form-urlencoded，拒绝重复字段，对已知字段严格验证；协议要求忽略的未知参数和 DCR metadata 在有界解析后忽略，不进入可信状态。绑定 code、client、redirect、resource、verifier；单次兑换在 PG 事务内原子完成。refresh 每次轮换，验证归属后先判消费状态、再验证可变 scope/resource；已消费 refresh 再用时撤销整个委托；同码重放同样撤销已签发委托；并发竞争最多一个成功。重放处理通过事务结果分支先提交撤销，再在事务外返回 invalid_grant，不能 throw 导致撤销回滚。刷新不能增大 scope/resource，也不能延长委托绝对到期。revoke 为拥有者客户端幂等撤销；userinfo 只返回最小本人信息。

resource 分开标识 API 和 MCP。MCP OAuth access token 和 Key 只能用于 MCP。MCP 经仅可信桥接服务可调用的兑换入口取得短期 API token，绑定同一委托；API 每次重新验证委托，桥接密钥本身没有账号权限。密钥由部署注入且不入库，不使用共享超管 token。MCP 发布 RFC9728 protected resource metadata 和 WWW-Authenticate；OAuth 错误与 CMS JSON 错误分开处理。

## 6. CLI 与 MCP 行为

CLI 用 SDK defineCommand/插件/请求扩展点，统一 stdout 数据、stderr 错误与标准退出码；复杂 JSON 支持文件和 stdin，密钥不推荐放命令参数。公共客户端认证按标准实现窄适配，不让 API 容忍空 secret 的 Basic 刷新。凭据按服务 origin/profile 隔离，目录 0700、文件 0600、原子写入，登录落盘、刷新和退出共用跨进程锁，防止旧会话覆盖新登录或合法并发刷新误判重放。浏览器启动器为可取消、有独立 10 秒上限的 SDK BrowserOpener 适配；不将启动器退出作为授权回调的前置条件，授权完成/取消/超时终止未完成启动器。HTTP 客户端固定配置 origin，不把凭据跟随跨 origin 跳转。

MCP 使用官方 SDK 的无状态 Streamable HTTP，采用稳定 @modelcontextprotocol/server 2.4.0 和 node 2.1.2。支持 2026-07-28 逐请求元数据及 SDK 提供的 2025-11-25/2025-06-18 旧版兼容入口，分别验证现代直接调用和旧版 initialize，不另造第二套工具实现。每请求独立 server/transport/身份，JSON 响应，不依赖实例内登录会话或 sticky session；完成/取消/失败均关闭资源。存在的 Origin 必须位于配置白名单，非法值 403；预检允许 Authorization、Content-Type、MCP 协议元数据头，暴露 WWW-Authenticate 和协议版本头，metadata 可公开读取且不得泄漏秘密。resource metadata/challenge 仅列 cms，不将 offline_access 列为资源必需权限。tools/list 按凭据权限过滤，tools/call 必须再次由 API 授权。工具注解仅用于客户端呈现，不承担安全判断。API 错误以 isError 和结构化 code/requestId 返回，不把 403/409/429 当成功。

CLI 文件字节流读取本地路径，下载到明确输出文件。远程 MCP 的字节操作使用有界 base64 输入和输出或资源引用，明确说明无法读取用户本地路径；不接受任意服务端路径，不抓取任意外部 URL。上限内逐字节保真，超限明确失败。所有 API 字节端点均有操作映射和契约用例。

## 7. 一致性、容量与生命周期预算

默认预算由应用配置统一注入：授权请求 5 分钟，授权码 60 秒，access token 10 分钟，OAuth 委托绝对上限 30 天，Key 默认 30 天/最大 90 天，子委托期限还受所有祖先限制；单账号有效委托 100、保留委托 1000、授权操作 1000、父链深度 4、DCR 客户端 10000、授权请求保留总数 20000；单委托 refresh 历史 16384、未到期 access 令牌 1024。达到预算返回明确限流/容量错误，不截断有效授权。分页沿用 maxPageSize=100，协议正文 64 KiB、MCP JSON 32 MiB、文件字节上限沿用 API 20 MiB，MCP 并发 32、在途正文预留总预算 128 MiB、HTTP 超时 60 秒、退出排空 10 秒。读正文前按可信预算预留（未知长度按单请求最大值），流读取仍验证实际长度，完成/取消均释放；响应保留至传输完成。以上是初始约束，不是容量测试结果。access 令牌过期即可删除，refresh 消费状态保留至委托到期；发行前就近清理所属委托过期 access，周期清理每 10 秒至多 1000 行，并索引到期、owner、grant、client。过期/终态授权请求清理，DCR 客户端初始 7 天到期，成功签发委托会将其有效期延长到最晚委托到期后 7 天，始终有限；仍有委托引用的客户端保留至其引用清理。容量上界包含保留记录，不只计算活跃记录。保留期内 tombstone 占用委托预算，到期后按子到父顺序有界回收；历史任务保留 UUID 来源，不阻止回收，也不能退化为浏览器授权。

MCP 二进制上传参数为 base64 内容，下载仅在 structuredContent 返回 `{encoding:'base64',data,mimeType,filename,bytes}`；content 只描述文件元数据，不复制字节。CLI 下载使用明确本地输出路径，JSON 输出仅报告元数据。全局/IP/账号协议限流使用共享 PG bucket；MCP 进程内准入只保护本实例内存，不替代共享鉴权限流。

授权、撤销和业务写入沿用安全锁：撤销提交之后开始的业务写不得授权成功。访问、创建、兑换都有限流；PG 故障默认拒绝，不能用旧权限缓存兜底。幂等重试保留相同 key 与请求指纹，并按 owner、委托 ID、操作和集合隔离；同一委托刷新/桥接保持重试身份，不同凭据不能取得彼此的缓存结果。非幂等网络错误不自动重放，版本冲突保留真实错误。客户端取消传播到 HTTP/DB/流并清理监听、定时器和文件句柄。

## 8. 迁移、回滚与运维

新增迁移只增加所属表和作业来源字段，不重写现有会话和账号，不改已应用 SQL。一次性迁移和 runtime GRANT 在放流量前执行；API/MCP readiness 检查实际数据库契约。过渡窗口为本次发布顺序，不增加旧路径别名、双收参数或第二授权器。回滚先摘流新 CLI/MCP，保留新增表与审计，旧产物继续读取现有结构；不得删除已持久化凭据来伪造回滚。

多 API/MCP 实例共享 PG 和一致公开配置、桥接密钥；TLS 终结、备份、PG 故障切换、秘钥分发和公网域名是部署职责。记录 requestId/operation/actor/credentialId/状态和耗时，不记录凭据。授权码/refresh 重放与客户端撤销写脱敏审计，成功令牌操作及 userinfo 记录 owner/credential 关联；按失败授权、兑换错误、刷新重放、撤销、容量拒绝、排空超时观察；双实例回归验证一次性兑换、轮换和撤销传播。

## 9. 研究来源

- [agent-cli-sdk](https://github.com/renxqoo/agent-cli-sdk)：仓库与 npm 稳定版本核对；本次 registry 为 1.0.2。默认 JSON 传输、复杂 query 和公开客户端刷新需项目适配。
- [OAuth 2.1 草案](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/)、[RFC8252](https://www.rfc-editor.org/rfc/rfc8252)、[RFC9700](https://www.rfc-editor.org/rfc/rfc9700)：公共客户端、回调、PKCE 和轮换。
- [MCP 授权](https://modelcontextprotocol.io/specification/latest/basic/authorization)、[安全实践](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)：资源发现、受众、禁止未验证转发。
- [官方 TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)：采用 npm 稳定 server 2.4.0、node 2.1.2，逐请求 server/transport，兼容旧版与 2026-07-28。
- [ChatGPT](https://developers.openai.com/plugins/build/auth)、[Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Cursor](https://prod.cursor.com/docs/mcp)、[Claude Code](https://code.claude.com/docs/en/mcp)、[VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)：OAuth 与 Header 接入契约；真实公网应用连接在部署后验证。
