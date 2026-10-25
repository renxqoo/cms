# OneAster 生产后台实施与验收

状态：认证首切片定稿，2026-10-26；关联[设计](admin-application-design.md)与[界面接口矩阵](admin-application-contracts.md)。用户已授权完整实现、多个子agent、提交推送及合并main。

## 1. 当前基线与顺序

合并组件库与已完成Collections/Assets main，保留双方脚本、依赖、架构和测试。首次合并lint/type/build通过，完整1151用例有7个production readiness失败，记录/tmp/oneaster-merged-test.log；已独立复现根因：fixture未显式提供存储目录，默认.data/assets的祖先/Users/wrr/work为0777，触发安全目录保护；同代码原后端worktree8/8通过，根仓换原Vitest配置仍7失败，诊断仅改安全临时root即全部ready通过。修复仅为两份bootstrap fixture注入隔离mkdtemp目录并在runtime关闭后清理，不改安全检查、不chmod用户目录、不带已知失败合main或放宽测试。

新阶段第一正式切片：安全BFF登录/注销、独立登录布局、SSR会话保护与真实/dashboard身份视图。它先通过方案审查、行为测试、完整四门和独立代码审查，校准跨API/Next/浏览器装置，再扩展全部业务面。复用切片实现，不另起临时认证。

后续批次：账户激活/找回/重置/资料改密；管理员与角色；权限/导航/端点/审计；配置驱动内容编辑器；资源/上传/图片/私有下载与任务/恢复；最终完整旅程与主分支CI。可在已冻结契约后并行隔离worktree实现，主会话拥有共享配置、BFF/DTO、布局接缝、装置、文档和合并；各agent拥有明确feature目录，不能共享写工作区或重建平行API client。

Collections metadata、任务/上传列表及恢复运维范围已向后端owner核对，具体补面先定稿，再实施其消费者；不把接口缺口填成mock、占位按钮或虚假成功。

## 2. 先行测试口径

BFF：允许method/path、拒绝代理逃逸/路径编码/非法query与超限body、Origin精确校验、无任意透传头、超时/Abort/204/非JSON错误、no-store、Cookie属性/绝对过期/不泄漏token、401/403/凭据错误不同处理。SSR跨两用户和未登录隔离，returnTo只允许已注册站内目标。

认证：缺省/校验/错误/429/retry/取消，密码Unicode与空格不丢失，fragment读取后立即清URL且不进存储，激活/重置用途分开，真实SMTP链接，改密撤销并回登录。先复现PasswordInput吞className后修，44px登录输入与眼睛居中真实浏览器验证。

管理：全operation授权分页、读与security写隔离、disabled-role自服务、管理员保护/归档终态/邀请真实投递状态、super-role只读、disabled grants显式处置、引用删除409、版本冲突保留草稿、幂等同意图重试、危险解绑影响与恢复、导航目录一致性/层级/详情高亮、审计完整详情。

内容：21类字段及结构、schema/default/readonly/localization、Array/Blocks稳定ID/排序、RichText受支持AST与危险链接、关系跨集合身份、join只读、fallback=[]、单例、草稿/自动保存/手存串行、发布/撤回/版本差异/完整历史恢复/回收站/引用保留/文件夹/批量与计划真实状态。无编辑锁时不伪造锁。

资源：实际PNG/PDF字节经浏览器→Next→API→存储、上传处理与ready/consume分离、取消/失败新会话重试/重新发现、真实byte进度、文件替换CAS、像素crop/focal/变体、后台reprocess新修订、私有GET/HEAD授权与历史binding字节、撤权后立即拒绝、Blob URL与轮询清理、回收站/版本恢复后字节仍正确。

## 3. 装置与门禁

browser调度器先构建API和Next，即使独立运行浏览器spec也不能使用陈旧dist。启动前分配Next端口，按开发Bun API/生产Node API分别建立隔离DB/SMTP/存储，向API注入对应CMS_FRONTEND_URL，向Next注入CMS_API_BASE_URL/CMS_ADMIN_ORIGIN；finally关闭Next/API/SMTP/DB并回收临时目录，失败同样清理。真实邮件验收必须直接打开SMTP提取的完整URL，不自行拼接token链接。复用test/support/cms-process真实隔离数据库、SMTP、本地存储及Bun/Node进程；禁止跨模块借私有__test__辅助代码。扩展现有test:e2e/Playwright，Next开发和生产各联真实API，测试专用配置/凭据仅位于test/support与e2e。不占用Tillgate端口，不登录其账号做数据写入，不改生产数据库作冒烟。

已有组件冒烟继续保留；新增admin-application.browser.spec.ts挂入test默认门禁。测试覆盖真实身份/授权/内容/媒体的终态，不能只断言200。全量lint/type/build/test与现有90/85覆盖率保持；TS/TSX及新BFF源码真实纳入统计。每个跨进程批次补真实旅程，不用mock替代唯一联调证据。

## 4. 审查与提交

每批先相关检查，里程碑完整四门，再由未实现者只读对抗审查；错误逐项先复现后修和命名回归。只提交点名文件；共享产物先协调，不隐藏/回滚他人修改。经验证的组件合并与每个完成批次推送，最终PR合并main并核对CI，不部署。记录实际用例数、四项覆盖率、实际浏览器与接口覆盖、仍未执行的部署类检查；不以某个局部范围门禁外推全仓。

## 5. 核销清单

- [x] 合并现有前后端并解决存储fixture的readiness/网络启动失败，完整四门通过。
- [x] 新阶段方案审查、真实登录切片、代码审查和四门通过。
- [ ] 账户与完整RBAC操作、权限矩阵和真实浏览器闭环通过。
- [ ] 所有集合字段/文档/版本/回收站/任务/文件夹界面完成。
- [ ] 上传/图片/私有历史下载/恢复的真实字节旅程通过。
- [ ] metadata与可发现列表接缝已完成，不留假动作或占位接口。
- [ ] 双语/浅深/1440与390/键盘焦点/取消与资源释放通过。
- [ ] 独立审查、全仓覆盖率、main合并与CI通过，真实报告限制。

## 6. 方案审查处置

独立审查提出SSR不可写cookie、客户端缓存/身份重置、非幂等认证响应丢失、角色两种写共用version、浏览器构建/邮件origin、共享接口未冻结、权限分页一致性七项；已在设计§3/4/7及装置计划明确协议和回归。内容与媒体扩面仍待owner新契约冻结后专项复审，不外推为本轮已经审结。

## 7. 认证切片集成记录

根入口改为/dashboard，组件验收固定/ui；入口单测和浏览器用例同步目标行为。共享AppShell通过surface注入导航、账户菜单和面包屑，工作台保留默认配置，生产布局只接收已验证的Me。退出请求进行中及结果未确认时隐藏受保护内容，失败显示可重试状态，成功使用完整文档替换清理客户端路由状态。

PasswordInput覆盖调用方className的缺陷先由命名用例复现，再合并className并垂直居中可见性按钮；真实Chrome修复前八个语言/主题/开发生产布局旅程均测得32px，目标44px。搜索冷启动缺陷通过延迟20个Next脚本复现：SSR先输入的DOM值未进入React state，点击Search时以空state触发去重而不导航；修复仅在submit读取真实输入并通知controlled父组件，不延迟加载或增加测试重试。hydrateRoot覆盖初始空值、已有query修改和删除；真实浏览器相同脚本修复后跳转?q=OneAster且无runtime error。

Node服务测试独立admin-server项目覆盖server/contracts/api，UI项目排除此范围；server-only标记列入既有副作用导入允许清单，前端直接声明zod与server-only依赖。

首切片正式四门通过：1489单元用例/153文件，statements93.39%、branches88.05%、functions96.72%、lines96.22%，全局与原有分组90/85门禁通过；真实API网络6例，真实浏览器54例（原组件34、新应用20，开发Bun API/Next与生产Node API/Next）全过。独立审查三项已核销：自动401迟到删除新会话、生产远端HTTP API明文凭据、未知网关写响应误当已确认失败；均有命名先失败后通过回归。浏览器装置SIGTERM实测exit143，七个子孙进程退出且临时目录为空。证据位于/tmp/oneaster-auth-final-{lint,typecheck,build,test}.log，覆盖率快照/tmp/oneaster-auth-slice-coverage-summary.json；后续完整应用范围仍按上方未勾项继续。

下一批账户/RBAC方案已独立审查并按十二项补齐[访问管理实施契约](admin-access-implementation.md)，恢复读取缺口已向后端owner同步，不在前端捏造查询结果。
