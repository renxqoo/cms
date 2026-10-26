# CLI/MCP 施工与验证记录

状态：定稿，实施中。对应 [设计基线](cli-mcp-design.md) 和 [单元验收](cli-mcp-units.md)。

## 1. 实施顺序

1. 盘点实际操作/schema、授权调用、任务来源和前端入口；独立审查三件套，处理后定稿。
2. 最小垂直切片：凭据持久化、委托认证及交集授权、个人 Key/授权管理 API、OAuth PKCE 闭环；从真实 HTTP 读取集合并创建文档，验证撤销。
3. SDK 与公共 HTTP 客户端、全部操作生成、字节传输；无状态 MCP、Key/OAuth 桥接及发现；完整 CLI 登录、状态、退出。
4. 后台个人凭据页面与浏览器授权流程，中文/英文、桌面/窄屏、错误/焦点/取消；同步导航与 BFF 契约。
5. 真实进程、双实例和浏览器旅程；四门、覆盖率、独立对抗审查与假绿抽查；按点名路径提交、push、合并 main 并 push main。

第一切片先走完整验证闭环；暴露的契约或装置问题先修设计，不推倒已验证代码。

## 2. 存量不变量

浏览器会话继续可登录、退出、改密码；最后一个超管保护、未绑定操作拒绝、collection 范围无 global 兜底；当前内容行级规则、资源引用、上传一致性、幂等和版本冲突保留。全量现有测试不能被删除、skip 或降断言；目标契约改变的固定操作数等投影断言需依据真实新增操作更新。

## 3. 新增门禁

根 lint/typecheck/build/test 纳入新 apps 和 client 包。生成物漂移进入 lint/build；新增 CLI/MCP 单测和覆盖率匹配不遗漏；新增真实进程和浏览器 spec 加入 test 入口与分组。阈值沿用仓库标准，不降低。先跑相关检查，里程碑执行四门。

## 4. 验收证据

尚未实施或执行检查。实现后在此记录真实测试数、statements/branches/functions/lines、各门退出结果、双实例证据、独立审查问题及处置、未完成的部署检查。不得以设计推演代替运行证据。

基线相关检查：identity/identity.test.ts 与 access/authorization.test.ts 共 2 文件、17 用例通过；未运行覆盖率，不能视为四门通过。

设计独立审查首轮处置：补齐委托子树管理、完整父链期限/撤销、聚合过滤后计数；将会提交文档的资产任务及上传会话纳入来源传播；协议按 RFC 忽略未知字段、仍拒绝重复；补充授权请求/保留委托/refresh 历史/access/DCR 记录预算与有界清理。

其余审查处置：创建时逐项验证有效权限，超界整单拒绝；父链/任务 FK restrict 保留 tombstone；重放撤销先提交再报错；MCP 采用稳定 v2 并分别验证新旧协议；补 Origin/CORS 和 offline_access 发现边界；新增在途字节预算及唯一 base64 返回表示。Key 资源固定 mcp，CLI 经已授权的 createKey 创建子 Key 是显式发行权限，不是 refresh/兑换换受众；子 Key 仍继承父链范围和期限。委托代同意明确继承父链。OAuth 30 天与 Key 90 天分别定义，子委托不突破祖先到期。

## 5. 工作区与交付

主 worktree：/Users/wrr/.codex/worktrees/cli-mcp-access/new-cms，codex/cli-mcp-access；起点 main 与 origin/main 相同，初始工作区干净。只提交本次明确路径；合并前重新核对主工作区状态和 main 更新。部署不在授权范围。
