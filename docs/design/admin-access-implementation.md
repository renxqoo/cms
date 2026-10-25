# 账户与访问管理界面实施契约

状态：定稿，2026-10-26。归属[应用设计](admin-application-design.md)和[接口矩阵](admin-application-contracts.md)。实现基于现有HTTP与已核对的账户/RBAC行为；安全恢复读取补面由后端owner先冻结，不以缓存或猜测替代。

## 1. 页面与依赖

认证补面包括/forgot-password、/accept-invitation、/reset-password；自服务/dashboard/account包括名称修改和改密。/dashboard/admins覆盖列表、筛选、邀请创建、详情编辑、重发邀请；/dashboard/roles覆盖CRUD及完整授权替换；/dashboard/permissions覆盖列表和CRUD；/dashboard/navigation管理树；/dashboard/endpoints显示真实操作目录和绑定；/dashboard/audit-logs只读展示API安全投影。所有入口验证服务端会话，页面只装配feature。

每个动作以完整operation三元组判断，不能从读许可推导security写许可；/me/operations已经反映security只向active super提供。管理员创建还依赖roles.list；角色授权依赖roles.get与permissions.list；permission collection范围依赖collections.list；导航与binding编辑依赖permissions.list及对应目录。读取依赖拒绝时显示具体故障、保留草稿、禁用依赖该数据的提交，不渲染无法完成的空选择器。账户自服务不要求管理权限，disabled-role仍能查看自身和改密。

## 2. 授权快照

单个Provider按principal.id实例化并拥有loading/ready/failed状态、完整operations、navigation及最近错误。只有ready参与can判定，刷新中或失败不得沿用旧写许可；所有feature复用该上下文。按身份和递增加载代次忽略迟到结果，替换前同时取得完整operations和navigation；403和自身RBAC写入触发同一刷新通道。撤权后的最终拒绝仍由后端裁决。

pageSize=100，最多100页/10000条，最多两轮总尝试（首次加一次一致性重读），整次加载截止30秒。逐页验证page/pageSize、total不变、页行数、三元组唯一、最终唯一数等于total；不一致时重读，超过预算或429直接失败，不在后台无限重试。不能以total证明事务快照，等量并发变更由请求时后端鉴权兜底。加载失败提供手动重试和真实Retry-After。

## 3. 路由与导航

前端真实route/icon注册表拥有路径、父级、双语标签、图标及读依赖，供shell、面包屑、导航编辑器和安全next校验共用。部署CMS_NAVIGATION_PATHS/CMS_NAVIGATION_ICONS与实际注册表一致，跨配置测试核对；不把/ui示例注入业务导航。未配置菜单时显示空态与按真实operation可用的管理入口，明确这些是应用入口而非API返回的菜单。

API树中group/page/action分别呈现，action没有path和operationId，不生成链接也不推导权限。未知图标使用安全缺省图标，失效路径禁用并说明，详情按明确父级匹配高亮。禁用祖先隐藏全部后代；group→page→action层级、带子节点删除及type更新遵循HTTP校验。没有原子重排接口，按单节点sortOrder编辑保存，不承诺多节点拖动原子成功。

## 4. 账户与管理员

激活和重置只从fragment取token，立即replaceState移除并仅保存在组件内存，不写URL/query/浏览器存储；缺token不调用预检。密码按15..128 Unicode codepoints和512 UTF-8字节验证且不trim。激活/重置204展示完成及登录入口，不自动登录；重置申请202不确认邮箱存在或邮件送达。

资料修改只提交实际更改字段并使用当前version。改密成功撤销并完整导航登录，已知密码错误保留当前身份；结果未知不自动重试。管理员编辑省略未变化roleId/status，避免重交当前disabled role；自身角色和状态不可提交。archived不提供恢复，名称与角色仍可按契约维护。

role/status实际变化会撤销目标全部会话、未消费邀请与重置链接，提交前确认且成功反馈明确副作用；active+pending可重邀，pending改角色后原链接失效但不自动投递。邀请显示真实delivery状态及冷却，不把accepted当最终送达，不虚构目标邮箱的凭据。

## 5. 角色、权限与并发

角色基本资料与授权区共享一个提交锁，任何一区提交时禁用另一保存；PATCH返回Role，PUT返回RoleDetail，使用响应version而非自行递增。成功更新确认快照并保留另一区草稿；无变化不发无意义保存。PATCH/PUT超时或uncertain=true后两区继续暂停，重读核实当前状态并保留两份草稿，无法核实时保留锁与再次核实入口，不能直接用旧version继续写。超管角色只读，permissionIds=[]不解释为没有权限。

disabled permission既有grant保持勾选和标识，只有用户明确移除后授权区才可保存；取消不丢选择。搜索、翻页及选项未加载不得删除已有选择。完整替换最大2000条遵循后端约束，不静默截断。

409后保留草稿：Admin/Role以单项GET重读，Permission和Binding通过不带当前筛选的完整分页定位；不能用当前页未找到宣称删除。读取被撤权时停止提交并保留草稿，绝不自动替换version重试。引用冲突只展示API已知信息，不猜受影响人数、角色数或完整反向引用。Role删除还受archived管理员引用限制。

## 6. 写入意图与恢复

每个声明要求幂等的创建/邀请按actor+operation+scope+key保存内存意图；相同payload失败重试保持UUID，编辑payload或明确放弃后另建意图，身份变化立即废弃。进行中和结果未知时禁用编辑及关闭，提供核实结果与显式重试同一操作；不自动换key。刷新前提示未确认状态，刷新后先从列表/审计核实，不能承诺恢复已丢失内存key或无限期服务端回放。邀请回放deliveryId相同但状态可更新，不要求响应逐字相同。

端点绑定操作只针对真实catalog和合法范围，不允许新增任意method/path。危险解绑或停用permission会影响相关读取端点，即使super也受其约束。现API尚无保证刷新后可用的独立恢复读；在后端恢复契约接入前，不提供会破坏自身恢复读取入口的界面写入，不显示始终可恢复的承诺。后端owner已收到补面请求；最终交付必须核销此缺口。

临时受保护恢复读取为global的endpoints.list与permissions.list：不允许删除其有效binding，也不允许把该binding指向disabled permission或停用其所引用permission。没有完整取得端点binding目录和permission状态时，禁用binding更新/删除及permission停用；依赖目录的新建同样不得凭未知选项提交。改名称等无授权影响操作按自身依赖执行。该限制只属于后端恢复补面接入前的阶段，不扩大或变更服务端授权语义。

## 7. 先行验收

覆盖完整分页与异常页/等量变更限制、刷新代次/卸载取消/失败撤旧许可、普通用户security写不可用、disabled-role自服务、只写缺读依赖；管理员角色变更撤销和真实重邀；角色共享version串行及两区草稿、disabled grants搜索分页保留；导航祖先/层级/未知路径、单节点失败不称整体成功；Permission/Binding跨页冲突定位；幂等未知结果不重复创建；真实SMTP激活/重置和浏览器双账户授权隔离。独立审查、四门及受影响真实API/Next浏览器旅程通过后核销。

共享URL状态从UIlab提升到components/shell/navigation/query-controller.ts及use-query-navigation.ts，保留同一实例Zustand pending/committed/traversal行为。每次updateQuery(changes,buildHref)注入当前URL构造器，不捕获动态collection旧路径；快速搜索和筛选组合、迟到提交及历史导航保留既有回归。UIlab与管理/内容调用方单轨迁移，删除旧feature实现，不保留路径别名。
