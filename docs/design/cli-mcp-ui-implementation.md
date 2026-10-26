# CLI / MCP 个人凭据前端实施记录

对应 [设计基线](cli-mcp-design.md)、[施工图](cli-mcp-implementation.md) 与 [单元契约](cli-mcp-units.md)。前端实现位于 `apps/admin`，业务通过现有 BFF 调用，不依赖后端或数据库实现。

## 已实现行为

- `/dashboard/account/credentials` 提供 API Key 与 OAuth 登录两个标签页，支持服务端分页、状态、权限详情、到期时间和最后使用时间。账户页、账户菜单和个人导航入口均可到达。
- API Key 创建输入名称、到期时间与资源权限；名称最多 80 字符，默认 30 天到期，最长 90 天。服务器继续检查父委托期限与即时权限。秘密只保留在当前弹窗的内存状态中，关闭即卸载；列表 DTO 和 BFF 投影不包含秘密。
- `ResourcePermissionEditor` 在 Key 创建和 OAuth 同意页复用。可选 tuple 来自 `access.myOperations`，`collections.list` 仅提供可见标签；元数据不可见时使用真实 tuple 的集合 key，不隐藏合法授权。OAuth 进一步与 `availableGrants` 取交集。分组只使用实际集合与操作的模块，不维护第二份操作词表。
- 撤销 Key、吊销单次 CLI / MCP 登录和撤销同应用全部本人可管理登录均要求确认，并按真实响应刷新列表。服务端返回状态，前端不以本地时钟重新解释凭据状态。
- `/authorize?request=<opaque>` 在服务端检查会话。登录回跳只接受单个严格格式的请求标识。应用、回调、目标资源、scope、保持登录能力与当前账户均可见；用户明确选择资源权限，也可指定登录名称。
- OAuth 读取与决定均经过 BFF，所有新增响应均进行 DTO 投影，不透传会话或 refresh token。返回地址必须使用 HTTPS 或已注册精确 loopback HTTP，并保持已验证回调的 origin、path 与已有 query。
- 创建与决定不自动重放未知结果；创建失败保留输入，未知结果锁定提交并提示从列表核实。读取、写入和到期定时器随作用域取消或卸载清理。表单标签、错误反馈、Base UI 弹窗焦点、键盘切换标签及中英文文案沿用现有组件。

## 受影响面

公共前端操作清单增加六项 `credentials.*` HTTP 映射；新增独立凭据 DTO、BFF 响应投影、个人路由和安全登录回跳。调整旧导航测试的完整期望以包含新个人入口，并增加来自后端的同路径菜单去重输入；原有拒绝和唯一性断言保留。没有修改首页、持久化、后端实现或共享测试配置。

## 验证记录

集成候选完整 lint/typecheck/build/test 通过，281 文件、2531 单元测试及开发/生产共 122 浏览器用例通过。管理端匹配范围覆盖率 statements / branches / functions / lines 为 95.42% / 90.96% / 95.50% / 97.42%，配置内门槛通过；全仓实际数字与独立范围见[总验收记录](cli-mcp-implementation.md)。

`e2e/admin-credentials.browser.spec.ts` 四条旅程在两个模式共 8 例通过：窄屏创建与撤销 Key、未登录 OAuth 回跳与 PKCE 兑换及两种吊销、拒绝授权、英文与键盘。长标签回归包含在英文窄屏旅程中；授权页面真实响应及同源 iframe 阻断均验证，预期 CSP 错误只在独立攻击测试页上精确断言。保持普通应用页面零意外浏览器错误。

独立真实 PG/HTTP 探针确认元数据不可见时仍可选合法 tuple、规范化默认端口回调可授权；独立生产 Next/Chromium 探针确认三类 HTML 页面禁止嵌入且 BFF 原有 CSP 保持。未执行部署及真实公网客户端认证。
