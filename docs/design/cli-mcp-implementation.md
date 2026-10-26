# CLI/MCP 施工与验证记录

状态：已实施，功能与本地验收通过，Git 交付待完成。对应 [设计基线](cli-mcp-design.md) 和 [单元验收](cli-mcp-units.md)。

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

2026-10-27 在主工作树执行完整门禁，四项退出码均为 0：

| 检查 | 实际结果 |
| --- | --- |
| `bun run lint` | 架构、生成物漂移、类型感知 oxlint 和 oxfmt 通过，0 错误、0 警告 |
| `bun run typecheck` | 根项目、UI 包、Next 路由类型与管理端通过 |
| `bun run build` | API、CLI、MCP 的 Node 产物及 Next 生产构建通过 |
| `bun run test` | 281 文件、2531 单元用例；5 个进程 spec、14 用例；24 个浏览器 spec、开发/生产共 122 用例通过 |

全仓实际覆盖率按 statements / branches / functions / lines 为 **93.82% / 89.00% / 96.21% / 96.45%**；全局门槛仍为 90% / 85% / 90% / 90%。配置内独立匹配范围均通过：管理端 95.42% / 90.96% / 95.50% / 97.42%，共享 UI 97.64% / 93.96% / 99.32% / 99.70%，lint 插件 96.81% / 92.97% / 100.00% / 98.11%。匹配范围是 vitest.config.ts 定义的运行时代码，不把此数字外推为未执行的部署测试。

完整门禁后的测试有效性抽查纠正 launcher 装置：仅将原生 spawn 的 executable 映射到测试程序绝对路径，其余参数及选项原样传递，实际创建进程；用 ChildProcess 的真实 PID 证明退出，不再把缺少 PID 文件视为已退出。随后全量单测与覆盖率再次 281 / 2531 通过，数字一致；最终装置定向通过。独立隔离变异分别删除 launcher 回收、将等待 launcher 放到回调之前，两种错误均触发失败。生产源码未因装置变化改动。

### 4.1 真实接缝

- `cli-mcp-api.spec.ts`：真实 Node API/CLI/MCP 与 PostgreSQL，CLI PKCE 经本人 HTTP 会话同意、loopback 回调、文档写入、API 重启、角色即时收权与单次登录撤销。两个 API、两个 MCP 进程共用授权事实，Key/OAuth 各自访问，跨副本无粘性、作用域过滤及撤销立即生效。
- `cli-mcp-transport.spec.ts`：真实 Node 客户端进程、受控上游协议，验证 stdin/文件/错误出口、官方新旧 MCP 协议、多账号隔离与两个 CLI 进程只刷新一次。此装置不替代上一条真实业务链。
- `admin-credentials.browser.spec.ts`：开发、生产各四条旅程，覆盖 Key 创建的一次性秘密及精确授权、单次/同应用登录吊销、拒绝授权、英文、窄屏、长标签、键盘焦点。真实 HTML 的 CSP/XFO 和 iframe 阻断均验证；测试攻击页独立记录且必须出现预期 CSP 错误，普通页面仍维持零意外错误。
- PostgreSQL 安全回归覆盖父链、自身/后代管理、其他 owner/兄弟/祖先拒绝、创建超界及重复 tuple、即时 RBAC、深度/活跃/保留预算、并发码/refresh 单次消费、token 到期不阻断有效委托任务、清理后来源 UUID 不置空且缺失即拒绝，以及 DCR 有限到期与名额回收。

### 4.2 独立审查核销

| 已复现问题 | 处置与回归 |
| --- | --- |
| DCR 未保存 grant/scope 限制、非原生回调动态端口、重复 JSON | 持久化注册能力，严格原生回调边界，解析拒绝重复成员；HTTP 负向回归通过 |
| userinfo 过期状态及合法回调错误处理 | 401 invalid_token challenge；已验证目标返回 state/iss；容量拒绝回调 temporarily_unavailable |
| logout 白名单旁路 | identity 内部检查有效委托操作，保留已撤销重复退出语义 |
| 上传换凭据继续处理及 ready 上传绑定 | 写/处理/最终绑定复查原来源与当前提交者；四条旧实现失败回归修复后通过 |
| 长期历史任务阻止凭据回收、DCR 永久保留 | UUID 软来源保留并 fail closed；动态客户端按最晚委托到期延长但始终有限 |
| 账号限额按 Key 分摊、refresh 历史误挡 bridge | 发行使用 owner/credential 双桶；不新增 refresh 的请求不消耗其历史预算；MCP 保留 429/Retry-After |
| 同 hash 的浏览器键捕获委托缓存 | 内部 0x01 前缀与外部 printable ASCII 键严格分离，保留浏览器存量重试 |
| 带坏 scope/resource 的旧 refresh 重放不撤销 | 先验证归属并处理消费状态，再检查可变参数，撤销及审计提交后报错 |
| CLI 公共命令强制认证、旧刷新覆盖新登录 | public 不加载/发送 token；登录落盘、刷新、退出共用锁；环境覆盖下拒绝误导的登录/退出成功 |
| 浏览器启动器阻塞回调期限/取消 | SDK BrowserOpener 接口的有界可取消进程适配，回调与启动器独立，完成后终止未退出启动器 |
| UI 隐藏有权 tuple、规范化回调误拒绝、长标签溢出 | 以有效操作为权威，元数据只作标签；规范化后仍核对目标；可换行并保留完整可访问标签和点击区域 |
| 授权及登录 HTML 可被嵌入 | 实际 HTML 设置 frame-ancestors none 与 XFO DENY，生产独立 Chromium 探针复核通过 |

独立后端、CLI/MCP、前端/BFF 审查均无剩余已证实问题。假绿抽查未发现新增 skip/todo/only、coverage ignore、门槛下降或有效旧断言弱化。旧固定断言仅按新增 6 个操作更新数量；ActorReference/BindAssetInput 调用迁移、真实新增迁移和生产必需配置同步更新。资源权限模型的旧元数据交集期望依据已复现缺陷改为有效授权 tuple 交集。

### 4.3 部署边界

本次没有部署。真实公网 ChatGPT/Claude/Cursor/VS Code 连接、目标环境容量压测、TLS/共享存储/PG 故障切换和备份恢复须按 README 及生产验收手册执行；不以本地多进程通过宣称实际生产高可用已经验收。放流量前运行新增迁移、操作核对及 runtime GRANT，配置一致公开 issuer/resource 与独立桥接秘密。

## 5. 工作区与交付

主 worktree：/Users/wrr/.codex/worktrees/cli-mcp-access/new-cms，codex/cli-mcp-access；起点 main 与 origin/main 相同，初始工作区干净。只提交本次明确路径；合并前重新核对主工作区状态和 main 更新。部署不在授权范围。
