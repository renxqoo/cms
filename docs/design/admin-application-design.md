# OneAster 生产管理后台设计

状态：认证首切片定稿，2026-10-26；大级功能。与[实施计划](admin-application-implementation.md)、[接口与界面矩阵](admin-application-contracts.md)共同约束本阶段。

## 1. 用户裁决与完整范围

用户已授权继续完整生产应用、真实接口联调、完成后提交/push并合并main；部署仍不在授权内。延续Tillgate admin的视觉、现有组件、中英文/浅深主题与窄屏。后台账户实体使用真实admins契约，不另造users数据模型。首期组件39指南已完成，本阶段增加账户/RBAC以及Collections、字段编辑、媒体/图片/私有下载、版本/回收站和任务的完整操作界面。复杂字段RichText/Array/Blocks/配置驱动渲染已进入本阶段。

已完成后端main55ec362与前端0a5dc37先合并验证，保留content:check、后端三组网络旅程和Next/browser检查。当前聊天原组件worktree是旧交付副本，不将其未提交重复文件再提交；实际集成工作目录为/Users/wrr/work/new-cms。并行实现必须基于已核对提交创建独立worktree。

所有界面读取真实HTTP。组件工作台/ui仍为隔离的公开合成示例，不充当业务页、认证或真实操作结果。后台本阶段不添加实际服务尚未提供的2FA、硬删除管理员、会话刷新、任意endpoint创建或运行时改集合DDL。

## 2. 页面与分层

app层只装配路由/URL/metadata/服务端授权。features/auth、account、admins、roles、permissions、navigation、endpoints、audit、collections、assets、jobs分别拥有表单流程、状态与文案；components/shell提供一套共享布局与导航，components/cms和packages/ui继续作为组合/通用组件。server下仅提供HTTP服务端请求与会话适配，不导入后端业务、数据库或SQL实现。contracts下是浏览器安全DTO验证与操作定义，不把后端implementation类型直接跨包导入。

登录/找回/激活/重置使用独立auth布局；/dashboard及其/admins、roles、permissions、navigation、endpoints、audit-logs、account、collections/[collection]、resources、jobs路由受真实会话保护。/进入/dashboard，未认证由服务端转/login；/ui仍独立直达。未知集合、缺少操作、无菜单和服务故障各有明确状态，不假装为空数据。

保持一套AppShell，通过明确model/插槽呈现工作台或真实账号、递归导航、账户菜单；不得复制两套侧栏/头部。偏好与用户状态按Provider实例创建。详情路径按注册路由的段边界匹配父菜单，不用任意startsWith。

未登录的已注册深层入口保留安全pathname作为登录next，不携带query或fragment。Next 16 Proxy只向/dashboard请求覆盖写入实际pathname请求头，不验证身份；共享requireSession从该头经同一registry验证目标，布局和页面继续各自验证真实会话。不信任客户端同名头，不从referrer或未公开框架头猜路径。集合路径仅接受合法key及new、structure或UUID详情；未知路径仍回/dashboard。

## 3. BFF与会话边界

Next Route Handler提供同源/api/cms/[...path]适配，只接受显式注册的method/path模板。绝不接受用户目标URL，不是任意代理。SSR直接调用相同服务端HTTP能力访问API，不经自身Route Handler绕行。服务端配置新增CMS_API_BASE_URL与CMS_ADMIN_ORIGIN，明确解析和部署说明；生产外部origin需HTTPS，仅loopback允许本地HTTP验收。配置/请求/响应大小和超时由配置层提供：JSON请求最大1MiB、JSON响应最大2MiB、请求15秒；字节代理上限32MiB、传输/下载90秒，实际媒体仍受服务端metadata更小预算限制。流式高水位64KiB，不为全部文件分配双份缓冲。

登录把后端opaque bearer保存为host-only、HttpOnly、SameSite=Lax cookie；HTTPS时Secure、__Host前缀及Path=/。不签发第二种身份令牌，不将bearer传给React props、Zustand、localStorage、URL或浏览器JSON。cookie绝对有效期不得超出后端expiresAt，无自动续期。登录JSON只回传安全成功信息；后台/me始终由后端验证。

变更BFF请求必须有与配置CMS_ADMIN_ORIGIN精确相同的Origin；拒绝missing/null/外域，不转发客户端Authorization/Cookie/Host/Forwarded等任意头。只构造Bearer、Content-Type、Idempotency-Key及必要流协议头，后端IP仍由原服务判断，不能靠伪造转发头绕过限流。部署文档说明BFF出口IP限流聚合及网关约束。

显式注销始终清本地cookie；后端撤销失败显示真实错误，不声称远端撤销成功。改密成功清cookie并返回登录。自动401响应及过期会话检查绝不发送Set-Cookie：响应无法对浏览器当下cookie作CAS，旧请求迟到不得删除并发登录的新身份。失效HttpOnly cookie保留到新登录覆盖、自然过期或显式注销，始终由后端验证且不授予访问权。登录/当前密码invalid_credentials及403同样不清会话。受保护页和每个数据入口在本次服务端请求中no-store验证身份，不能仅依赖会复用的layout。SSR只跳转/login?reason=expired并保留安全站内next；客户端同源POST /api/auth/expired-session重新验证入站cookie，无cookie或后端确认为401返回204，已有效则返回409 session_changed，503保留并提供重试；三种结果均不写cookie。显式退出是针对该浏览器身份的用户动作，即使跨页并发新登录也清除浏览器身份。

登录/注销/改密成功使用完整页面replace导航，不仅router.push；所有受保护文档与API均no-store。新的用户身份建立新的Provider，Provider key至少为principal.id，刷新同身份数据直接通过Context props传播而非effect复制派生状态；所有页面/Route Handler各自验证。真实浏览器核对退出→另一账号登录→历史/预取返回，不显示旧身份或旧表单；若浏览器恢复持久页面，pageshow时重新验证当前会话后才允许受保护内容操作。

邀请/重置token只从fragment读取，立即从地址移除，只保存在本页内存并随提交发送；query/log/存储不保留。缺token不发预检请求。新密码按15..128 Unicode code points且UTF-8<=512字节校验，绝不trim；激活/重置成功不自动登录。重置申请202只说明请求已接受，不宣称邮件送达或账号存在。

API响应保留HTTP状态、error.code/fieldErrors/requestId与Retry-After，204不解析JSON。错误按code本地化，未知格式返回安全故障反馈，不输出内部堆栈。所有用户/权限/私有字节响应no-store；下载保留安全文件名/ETag/Content-Type等白名单头，其他内部头不透传。

## 4. 授权、导航与管理写入

/me/operations必须按真实分页取全，以operationId+scopeKind+collectionKey精确判定每个操作；不由菜单、roleCode或读权限推导写权限。capabilities只表示模式支持，不能代替授权。403区分forbidden/endpoint_unbound/protected_resource并提供正确恢复提示；后端始终最终裁决。

权限加载有硬预算：pageSize100、最多100页/10000条、最多两轮总尝试和30秒整体截止，按三元键去重。loading/failed不沿用旧写许可，按身份与代次拒绝迟到结果，完整operations/navigation共同发布。页码/总数变化或页重复不完整时进入可重试故障态；多页HTTP不保证事务快照，最终权限由后端检查。403及自身RBAC修改后统一刷新，详见[访问管理实施契约](admin-access-implementation.md)。

shell读取/me/navigation并按可信前端路由/图标注册表呈现；账号/概览等自服务入口按authenticated身份提供。新部署的导航管理仅使用真实已实现页面目录，API配置中注册同一允许路径/图标；不允许任意URL。API暂无目录读取接口，前端选择来自真实路由注册表，部署配置与跨数据一致性测试核对。没有配置菜单时提供明确空态与按真实操作可用的管理入口，不伪造服务返回菜单。

管理资源用version CAS，内容文档用revision CAS；DELETE依各操作放query，不能全局把所有DELETE统一version。创建/邀请等幂等操作每个提交意图生成一个UUID；同payload的失败重试保留key，编辑payload或新的业务提交意图换key；只是重新认证同一actor不自动改变仍待确认的创建意图。只对后端声明idempotency:required的操作承诺相同key回放；客户端没有通用自动重试。激活/重置/改密/注销不具备该保证，响应丢失呈现结果未确认，提供尝试登录、重新申请等对应恢复入口，不声称原操作失败或无副作用。失败保留输入；409冲突重新读取并呈现当前状态，不自动换新版本覆盖。

角色详情将基本资料与完整权限替换分成两个明确保存区，不能并行共用同一version。每次成功用响应的新version更新已确认快照，另一未保存区保留草稿；若后续冲突/失败，明确提示已保存与未保存部分，不显示整体成功或回滚假象。

自身role/status不可提交；archived账户不提供解档，仍可维护名称/迁移角色；super角色只读；disabled permission既有grant保留可见并要求明确移除。独立恢复读接入前禁止导致endpoints.list/permissions.list恢复入口丢失的界面操作，完整判定见[实施契约§6](admin-access-implementation.md#6-写入意图与恢复)。审计只读，列表细节查看API安全投影并可复制requestId。

## 5. Collections与资源

配置驱动编辑器从安全HTTP metadata构建，不从API源码导入集合定义。布局/标量/关系/JSON/代码/point/group/array/blocks/richText/join均使用实际类型编辑控件，未知能力明确不可编辑而非假成功。当前metadata的布局树、写能力、本地化和上传预算缺口已交后端owner核对；相应契约定稿后才实施此批编辑器，不用重复前端固定集合配置绕过。

内容语言与UI语言分离。编辑读取fallback=[]，避免把回退文案当真实翻译保存；多语言共享array/block结构保持稳定ID。字段派生值直接计算，写入shape与只读join严格区分，后端仍验证。富文本只提供已支持的v1节点能力，不执行任意HTML，不虚构marks/heading-level语义。集合建模为已有TypeScript配置/生成迁移，结构视图只读，不造配置保存端点。

保存/草稿/发布/撤回/复制/版本对比与恢复/回收站/计划/批量/文件夹全部对应真实操作。后端当前只有revision冲突，没有编辑锁租约；真实页不得呈现组件示例中的伪锁或接管。自动保存仅在drafts支持且明确启用时执行，一次最多一个任务，后续编辑只合并最新待存快照；失败/冲突暂停并保留输入，手工保存/发布与其串行。

上传顺序为创建会话→原始octet-stream字节→completions→处理轮询→ready后绑定文档。XHR进度只描述浏览器传输，不把100%当处理完成；失败会话重试新建，不对失败会话重复PUT。上传并发和队列有界、卸载取消传输/轮询，取消后晚完成不绑定新文档。元数据提供真实MIME/bytes/recipe能力，不在底层写死应用预算。

图片裁剪组件归一化值显式转换API像素整数crop；focalPoint保持0..1。reprocess后台自动创建新修订，成功重新读取，不能再PATCH uploadId。私有预览从认证BFF取得Blob，替换/删除/卸载回收URL；历史固定媒体使用来源document的bindingId下载，不误取媒体最新版本。资源恢复复用文档版本/回收站，物理清理运维恢复是否扩展HTTP由后端补面契约明确，不能把离线命令包装成假界面动作。

任务/计划和上传会话需要服务端可发现列表以支持刷新/换设备恢复，不能仅依赖localStorage记录ID；此缺口与metadata同批协调。处理轮询尊重实际后台维护周期及Retry-After，状态与取消/恢复以服务端为准。

## 6. 可靠性与预算

每个请求一个AbortController及有限超时；页面/弹窗关闭取消在途工作。每个编辑会话一个提交意图、每个轮询资源一个计时器，不允许重叠请求；响应后再安排下一次。列表URL是查询状态来源，快速连续搜索/过滤复用已有导航意图机制，防止参数互相覆盖。无跨请求用户状态单例。

上传字节流式转发并施加有界预算，不把整个文件转Base64/JSON或重复缓存；队列和本地预览数有界。图片/富文本的编辑预算依据服务端安全metadata和前端配置交集。网络失败、权限撤回、重复点击、取消、重开、迟到完成都有可观察且可重试的反馈。

生产可用指本次应用与真实后端旅程通过，不把部署、容量测试、云故障切换或PITR演练宣称完成。它们不因用户要求生产应用而自动获得部署权限。


## 7. 首切片共享接口冻结

contracts/operations.ts声明唯一OperationDefinition：id、target(backend/frontend)、method、path模板、access(public/protected)、bodyKind(none/json/bytes)、queryKeys、idempotency(required/none)、responseKind(json/empty/stream)。现有76个业务操作及受保护OpenAPI入口逐项声明为target=backend；前端自有session.expire（POST /api/auth/expired-session）在同一注册表声明target=frontend、无body、empty成功响应，只由client编码直达，不被backend代理匹配或SSR直连函数接受。所有条目target必填，无双轨默认。不从浏览器动态指定目标。BFF按此表封闭匹配，client与SSR共用路径编码器；未知key/重复query/非法segment提前返回安全错误，业务字段完整语义仍由后端验证。

浏览器入口api/client.ts只导出requestApi<T>({operation,params?,query?,body?,response:z.ZodType<T>,signal,idempotencyKey?})与ApiResult<T>。ApiResult为{ok:true,status,data,requestId}或{ok:false,status,error:{code,message,requestId,fieldErrors},retryAfterSeconds,uncertain}。不全局缓存用户或结果，不自动重试。未确认写入与明确后端错误区分；Abort由调用方忽略旧会话结果。204用明确的empty响应schema，不尝试JSON。调用方不得自行包装另一套fetch/错误或权限键。

server/api.ts提供对应的API直连能力，server/session.ts处理cookie与安全投影；这些模块导入server-only，contracts/client不重导出任何server函数。构建验证客户端不能导入server边界；架构规则补合法/非法样本。login的后端token响应schema只在server内存在；浏览器只验证{expiresAt}。服务端每次渲染可用React cache作请求内合并，不建立跨请求身份缓存。

第一切片消费者冻结为/login、POST /api/cms/v1/auth/login与logout、POST /api/auth/expired-session、/dashboard和根重定向；/ui工作台继续存在。登录成功完整导航/dashboard，错误安全本地化、Origin/timeout/abort/cookie/隔离通过真实API/Next/Chrome验证后再扩面。

SSR交互在hydration完成前禁用：共享AppShell与AuthLayout使用同一就绪边界，稳定server snapshot=false/client snapshot=true，无新增监听或计时器。未就绪子树inert，外部保留辅助技术可读的准备状态；登录字段与提交额外disabled，避免原生表单被JSON-only BFF拒绝或首个菜单点击丢失。就绪后恢复原有样式及交互，真实浏览器延迟Next脚本回归覆盖首次点击和提交，不用sleep或重复点击掩盖时序。
