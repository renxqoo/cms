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

内容：20类字段及结构、schema/default/readonly/localization、Array/Blocks稳定ID/排序、RichText受支持AST与危险链接、关系跨集合身份、join只读、fallback=[]、单例、草稿/自动保存/手存串行、发布/撤回/版本差异/完整历史恢复/回收站/引用保留/文件夹/批量与计划真实状态。无编辑锁时不伪造锁。

资源：实际PNG/PDF字节经浏览器→Next→API→存储、上传处理与ready/consume分离、取消/失败新会话重试/重新发现、真实byte进度、文件替换CAS、像素crop/focal/变体、后台reprocess新修订、私有GET/HEAD授权与历史binding字节、撤权后立即拒绝、Blob URL与轮询清理、回收站/版本恢复后字节仍正确。

## 3. 装置与门禁

browser调度器先构建API和Next，即使独立运行浏览器spec也不能使用陈旧dist。启动前分配Next端口，按开发Bun API/生产Node API分别建立隔离DB/SMTP/存储，向API注入对应CMS_FRONTEND_URL，向Next注入CMS_API_BASE_URL/CMS_ADMIN_ORIGIN；finally关闭Next/API/SMTP/DB并回收临时目录，失败同样清理。真实邮件验收必须直接打开SMTP提取的完整URL，不自行拼接token链接。复用test/support/cms-process真实隔离数据库、SMTP、本地存储及Bun/Node进程；禁止跨模块借私有__test__辅助代码。扩展现有test:e2e/Playwright，Next开发和生产各联真实API，测试专用配置/凭据仅位于test/support与e2e。不占用Tillgate端口，不登录其账号做数据写入，不改生产数据库作冒烟。

已有组件冒烟继续保留；新增admin-application.browser.spec.ts挂入test默认门禁。测试覆盖真实身份/授权/内容/媒体的终态，不能只断言200。全量lint/type/build/test与现有90/85覆盖率保持；TS/TSX及新BFF源码真实纳入统计。每个跨进程批次补真实旅程，不用mock替代唯一联调证据。

## 4. 审查与提交

每批先相关检查，里程碑完整四门，再由未实现者只读对抗审查；错误逐项先复现后修和命名回归。只提交点名文件；共享产物先协调，不隐藏/回滚他人修改。经验证的组件合并与每个完成批次推送，最终PR合并main并核对CI，不部署。记录实际用例数、四项覆盖率、实际浏览器与接口覆盖、仍未执行的部署类检查；不以某个局部范围门禁外推全仓。

## 5. 核销清单

- [x] 合并现有前后端并解决存储fixture的readiness/网络启动失败，完整四门通过。
- [x] 新阶段方案审查、真实登录切片、代码审查和四门通过。
- [x] 账户与完整RBAC操作、权限矩阵和真实浏览器闭环通过。
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

分支CI首次冷启动出现五个开发模式失败：三个搜索在控制器hydration前接收自动化输入，两个截图在hydration前由工具注入caret样式导致不匹配。修复为SearchBar自身ClientFieldset在服务端disabled、自身hydration后启用，保持children身份与既有DOM值读取；唯一useClientReady提升到UI feedback，删除app副本。新增命名回归先在旧代码确认server search未disabled失败，再验证修复通过且原三条hydration保留。截图先验证真实提交可用并使用caret:initial，不改44px、焦点、眼睛位置或错误断言。独立只读审查无P1/P2，修复后本地两模式54浏览器通过；CI结果另行核实，不能用本地通过代称。

后续全量复验定位两处测试装置接缝：历史前进连续调用未核对中间/ui到达，Chrome发生Page.getNavigationHistory临时未附着；改为每次到达后断言真实页面，再继续下一步。可搜索选择框Escape后立即查全页同名combobox，在关闭动画期间同时命中trigger与popup input；补充popup已移除和焦点恢复断言，保留原文本/错误/创建断言，未改成first或删除检查。选择框定向重复三次、两模式共六例全过，历史两模式两例全过；没有增加自动重试、sleep或扩大超时。

发现规则核对确认：自定义UI exclude替换了Vitest默认排除项，宽泛apps/admin路径扫描到node_modules工作区软链，重复执行了组件测试；前述1489/1493为当时实际执行计数，不能作为独立用例数。扫描现已限于各自src，并保留configDefaults.exclude。新增命名回归调用真实Vitest发现入口，旧配置因依赖副本失败，修复后同时验证所有自有源测试恰好发现一次，无删减有效测试或降低覆盖率门槛。后续报告使用去重后的实数。

已集成Collections UI接口增量1477c28，真实后端75个操作与前端封闭manifest逐项对齐。合并无源码冲突，保留既有安全临时存储fixture和Next配置。去重后四门：1426单元用例/156文件，S93.30%、B88.43%、F96.83%、L96.12%，全局及原分组门槛通过；API网络6例、浏览器54例均过。CI的剩余键盘排序失败证据为SSR inert期间自动化focus未生效；测试以真实点击聚焦、确认未起拖，再用Space开始键盘拖动，保留移动/取消/禁用断言，两模式各三次六例通过，没有改生产排序逻辑或重试配置。

## Security恢复读集成

已集成后端3c3134a的`access.readRecovery`，前端封闭manifest现有76个业务操作。恢复读仅限实时有效super_admin，经独立security入口读取端点、绑定和权限的最新CAS版本；不绕过普通写鉴权。UI在普通读实际403时提供恢复入口。当前提交完成契约和后端集成，恢复页面随RBAC批次验收。

CI 40243386424发现Monaco高度测试在textbox首次出现后立即读取，早于引擎onMount的passive effect。测试改为等待目标180px可观察布局，再验证预算更新与监听释放；保留原断言，不添加重试配置。

本批四门完成：1447独立单元用例/160文件，S93.37%、B88.49%、F96.87%、L96.16%，原全局与分组门槛均通过；API网络8例、开发与生产浏览器54例通过。第一次并行全仓运行有两例PostgreSQL lock_timeout，无其他全仓会话时完整复验通过；未修改锁预算、测试策略或后端行为。

## 账户、访问管理与字段集成验收

账户激活、找回、重置、资料CAS和改密已连接真实HTTP及SMTP。管理员创建、显式重邀、角色/状态副作用、自身保护、角色两区共享version、权限、导航、端点绑定、审计和独立安全恢复均完成真实浏览器闭环。改密通过统一会话动作同步卸载受保护子树后导航，不触发未保存资料的离站确认；管理员创建的未知重试要求角色读取依赖仍可用。

字段渲染覆盖20类metadata节点。独立审查实证并核销三项：array/blocks按UUID和blockType比较旧行，只提交实际改变的子字段；富文本媒体按当前editorState/nodeKey订阅位置，祖先移动后使用最新sourcePath并释放监听；自定义富文本节点严格校验已知type/version/payload封套，保留合法扩展payload，不猜其内部schema。授权加载保留任一已确认的unauthenticated401，不被并行503或读取截止时间覆盖。以上均有近置先红后绿回归，另17个独立诊断用例复验通过。

唯一客户端支持真实XHR原始字节进度与取消、JSON响应预算，以及保留二进制字节的私有Blob下载；继续使用同一封闭BFF、Cookie、Origin和幂等边界。Next Proxy仅覆盖实际受保护pathname请求头，登录next使用同一注册表，真实失效深层账户入口重新登录后返回原页面。

四门复验通过：1993独立单元用例/215文件，S93.98%、B89.00%、F96.73%、L96.68%，原全局及分组90/85门槛通过；API跨进程8例、开发和生产浏览器72例通过。共享postgres测试数据库出现一次原HTTP装置lock_timeout，使用独立临时CMS_TEST_DATABASE_URL后完整复验通过，临时数据库随命令退出删除，未改生产锁、超时、限流或覆盖率。

恢复旅程真实解除两个普通目录的绑定，再以独立安全读创建权限和绑定，核实两目录200且刷新后仍可读。两条已知403探测各至少一次、至多两次；授权刷新可能取消另一在途探测并在恢复ready后重新读取，全部实际403逐条登记，其他浏览器错误保持零。原认证撤销旅程在两个授权读取已完成后执行显式服务端吊销，验证SSR深层保护，避免混入初始化在途401。停用权限旅程新增保存禁用断言和明确影响确认，保留全部授权及引用冲突断言。

证据为/tmp/oneaster-admin-fixes-{lint,types,build}.log、/tmp/oneaster-admin-isolated-database-test.log及对应独立审查红绿日志。Collections、资源界面及其新浏览器旅程仍按后续清单继续；不以本批通过声称其已经验收。

## 嵌套编辑保护与测试邮箱收口

真实内容编辑器与内部文件夹、图片弹窗共用navigation adapter。嵌套guard通过React实例内的scope聚合dirty，最外层只订阅一次导航并处理原生离站和确认，内层卸载仅移除自身登记。不同adapter独立，祖先adapter跨另一scope重现时仍复用原登记。ManagementDialog的可选受控dirty覆盖裁剪、焦点和变体按钮等无原生change的修改，pending及未确认locked继续保护。五个真实controller回归、真实Base UI模态框取消导航后草稿及焦点恢复、受控dirty和旧guard共18例通过；非作者审查及真实文件夹开发/生产两旅程通过。

GitHub 7730901的CI只在邮箱测试等待客户端close时超时。独立Node26.9诊断证明，暂停客户端读取时服务端close已完成，客户端必须resume才消费EOF；Bun1.4.4表现不同。两runtime各1000个真实并发连接压力未复现服务端泄漏，因此只修测试的pause/服务端关闭/resume/客户端关闭顺序并finally清理，不改邮箱服务、不增加超时、重试或skip。

本批四门通过：2000独立单元用例/218文件，S93.99%、B88.99%、F96.74%、L96.69%，原全局与分组门槛通过；API跨进程8例、开发/生产浏览器72例通过。完整测试使用退出即删除的独立临时数据库。证据为/tmp/oneaster-shared-guard-mailbox-{lint,types}.log、/tmp/oneaster-guard-mailbox-{build,test}.log及/tmp/oneaster-content-folder-guard-second.log。GitHub结果以随后推送的检查为准。
