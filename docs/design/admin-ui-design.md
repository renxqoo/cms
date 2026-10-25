# OneAster 管理后台 UI 设计

状态：定稿，2026-10-26；已完成独立方案审查与必要修订。功能级别：大，新前端子系统。本文与[施工图](admin-ui-implementation.md)、[组件映射](admin-ui-components.md)构成实施基线。

## 1. 用户裁决与本期范围

用户裁决：品牌 OneAster，先用文字标识；在 apps/admin 建立 Next.js App Router 管理后台，React、TypeScript、Tailwind CSS、Zustand，shadcn 风格与 Base UI 交互原语。视觉以本地 Tillgate admin 为 1:1 基准，审查并重新实现，不整包搬运。简体中文/英文、浅色/深色均验收。

用户裁决：本期交付完整 UI 组件库、后台布局、独立组件验收页。完整范围为 Payload UI Components overview 的七类、39 篇指南，单篇可能涉及多个组件，逐项见组件映射。真实认证、RBAC、内容、发布、文档锁和媒体 API 接入归后续业务阶段；本期不修改这些 HTTP/DTO、数据库、迁移或后端任务。Rich Text、Array、Blocks、配置驱动字段引擎归下一阶段。

验收页明确标为 UI 工作台，仅在该功能目录及测试装置保存示例，展示本地交互和可注入的操作结果，不建立假登录、假用户会话或伪装实际上传/发布成功。登录表单作为受控组件验证字段和提交事件，不建立认证路由或身份绕过。验收工作台公开内容只有合成示例，不读取私有 CMS 数据；未来启用真实后台时单独决定访问策略。

## 2. 存量不变量与影响面

存量：apps/api、packages/cms、packages/database 的运行行为、精确导出及安全约束保持；后端 Bun/Node 旅程和原有覆盖率阈值保留。当前 build 仅构建 API，Vitest 仅匹配 ts，根 tsconfig 尚无 TSX/Next 语义，本期扩展而不替换现有检查。

影响：新增 apps/admin 前端入口、packages/ui 精确公开入口、依赖及 bun.lock、前端 TypeScript 配置、架构检查、React 单测/覆盖率、开发和生产浏览器冒烟及对应文档。后端 HTTP/DTO、持久化、配置和后台任务没有新增能力。新增 UI 内计时器、观察器、拖拽监听、对象 URL 和未决异步操作必须在关闭、替换或卸载时清理。

本期是新能力，不迁移源系统用户、业务数据或服务。不存在新旧路径并行或兼容窗口；只交付一套组件实现。回滚可回退本期前端与工具变更，无数据库回滚。

## 3. 目录与依赖

packages/ui/src 按 primitives、forms、data、feedback、layout、navigation 及实际需要的 hooks 组织，提供精确子路径 exports。组件不依赖 Next、apps、CMS、数据库、环境配置或 next-intl。共享文案由调用方传入，默认文案不得藏在底层。主题 token/字体/reset 归 ui/styles，布局与状态样式归组件 Tailwind 类。

apps/admin/src/app 仅负责路由、metadata、服务端布局与边界；components/shell 负责 Next 导航和框架布局；components/cms 负责关联、上传、文档状态和操作等组合；features/ui-lab 负责验收场景与示例；i18n 负责两种语言文案；config 负责品牌、导航和用户偏好缺省。仅创建有真实实现与调用方的目录，不预建空业务功能、API SDK 或通用插件框架。

依赖方向：admin → ui；cms 组合 → ui；ui-lab → shell/cms/ui。浏览器代码不得引用后端源码、CMS 或数据库包；ui 不得引用 Next 或应用。根架构检查同时验证合法与绕过样本。Next 导航适配通过 render/children 组合，避免 ui 内硬编码路由。页级与组件实例状态不在模块顶层持有用户数据。

## 4. 视觉与服务端边界

Tillgate 参考：packages/ui/src/styles/globals.css，apps/admin/src/app/(main)/layout.tsx，列表/表格/FormDialog 实际页面。主要基准为 Inter 字体、基础圆角 0.625rem、输入框 h-8、顶栏 3rem、桌面侧栏 18rem、收起侧栏变量3rem（inset组合实际占位4rem、固定容器4rem+2px），内容边距沿用 px-5/md:px-6/lg:px-8/xl:px-10。颜色、按钮变体、边框、阴影、遮罩与动画按源视觉核对。来源有差异时以实际 admin 组合结果为准，不能拿组件默认值替代页面覆盖值。

同一表格与弹窗仅保留一套通用实现；Next URL 绑定是适配逻辑，不复制整个视觉组件。页面与静态布局默认 Server Components；交互叶子、Context/Provider 和浏览器能力进入 Client Components。不把函数 props 从服务端传入客户端；cell renderer 与列定义需在使用它们的同一运行边界构造。

导航分组偏好以稳定ID保存，面包屑随路由装配和清理，当前项呈现纯文本；真实路由过渡呈现开始/完成/取消的进度。语言和主题偏好首次由服务端读取 cookie 后传给 Provider，客户端切换更新界面与偏好；重载保持，无 hydration 警告、主题闪烁或跨请求泄漏。Zustand 只在确有跨组件协作的 shell/工作台实例中通过工厂和 Provider 创建；不把所有表单装入全局 store。编辑器/图表按需加载，不使每个页面加载 Monaco。

## 5. 关键组件契约

### 5.1 表格、列表与搜索

DataTable 接收 rows、columns、稳定 rowKey；排序、分页和选择由调用方控制。排序事件只描述请求，不擅自筛选服务器数据。选择以稳定 ID 表达，当前页全选、半选及跨页保留策略由显式契约决定；默认仅当前页，不暗示选择全部服务器结果。loading/empty/error 互斥且可观察，错误可以重试，窄屏横向滚动并可键盘访问完整列。仅显式 actions 列固定，不无条件固定最后一列。

SearchBar 支持提交模式与防抖模式，后者的 debounceMs 由配置注入；支持清空、输入法组合输入、不重复回报同一值，卸载清理计时器。Next 列表适配以 URL 保存搜索、筛选、排序和分页，修改搜索/筛选回第一页，保留其他合法参数，浏览器前后退可恢复。可用查询字段及参数名由实际页面定义，不猜后端契约。

### 5.2 表单与覆盖层

FormDialog 只有一种明确的原生 form 提交契约：onSubmit 接收 AbortSignal，返回 success 或 error（含可展示的字段/表单错误）的判别联合；抛错也必须转换为可见错误，不产生未处理 rejection。重复提交只执行一次。失败保留输入与弹窗，只有明确 success 关闭。关闭/卸载取消未决操作，过期结果不能关闭重新打开的实例。控件支持 label、description、required、invalid 和只读/禁用区分。

Dialog/Drawer/Popover/Menu 基于 Base UI，支持 Esc、焦点约束与恢复；嵌套弹窗和菜单开弹窗必须验证。忙碌时关闭策略明确：取消未决 UI 任务后关闭；取消不宣称撤回已在服务器提交的事务。ConfirmDialog 按同一异步与错误契约工作。关闭按钮的辅助名称由本地化调用方传入。

### 5.3 CMS 组合与本地字节能力

RelationshipPicker用{collection,id}复合身份，跨集合相同id不得串选；不可用/不存在的已选值显示明确状态，不静默删值；maxRows及过滤约束显式输入，异步搜索接收AbortSignal且过期结果不覆盖新查询。其具体props在CMS批次编码前冻结。RelationshipPicker 接收可选集合、结果、当前选择、搜索状态、权限与回调，支持单/多值、内联搜索/抽屉、创建/编辑入口及排序；本期仅对明确注入的数据发出事件。可选择不等于服务器已授权，后续业务仍需服务端检查。

DocumentActions 接收 dirty、busy、权限、draftsEnabled、create/update、新建/已有、uploadPending、草稿/发布状态、预览 URL 及对应操作回调；权限/状态决定可用操作：无drafts不显示发布/撤回；已有且未改禁用保存；新建按create权限；上传中禁用写动作；预览需安全URL；批量操作展示逐项结果。DocumentState 呈现锁定主体、接管确认、未保存离开保护、冲突与恢复入口，锁及租约均为外部受控事实，不在 UI 内制造服务端锁。离开保护通过明确的OneAster导航适配器接管Link、程序化导航和back/forward，beforeunload仅在dirty时安装；取消保留输入，确认只重放原目标一次。适配器不承诺拦截未接入其入口的任意第三方router调用。文档草稿语义以本 CMS 设计为准，不照搬 Payload 的“跳过全部校验”。

UploadInput负责媒体文档关系选择，Upload负责文件本身编辑。接入本地文件或粘贴的安全远程URL均可触发明确事件，远程字节抓取归后续服务端，不在浏览器盲抓。Dropzone 支持文件选择、拖放与聚焦区域内粘贴；接受类型、文件数和大小预算从调用方注入；本地预检反馈明确，最终内容安全校验归未来服务端。UploadInput/UploadManager 呈现选择已有、创建、队列、进度、取消、重试、替换/移除及部分失败，接收注入的字节处理函数和 AbortSignal。示例只作本地预览/交互，不调用虚构 HTTP 端点。创建的 object URL 必须在替换、删除和卸载时回收。裁剪/焦点控件输出标准化几何值并支持键盘，保留原文件，实际图片处理归后续业务。

DraggableSortable 支持稳定 ID、鼠标/触摸/键盘、可见拖拽把手、取消和无目标落点，结束后发出新顺序。CodeEditor 提供真实代码高亮、编辑/只读与语言配置，按需加载 Monaco 并清理实例。DatePicker/TimezonePicker 明确显示时区和格式，日期值不隐式改变时区。

## 6. 资源预算与可靠性

每个 SearchBar 最多一个防抖计时器；每个提交组件最多一个在途操作；卸载取消任务并忽略过期完成。每个本地文件最多一个活跃预览 URL，不全局缓存文件字节；文件数量/大小由上传控件配置明确注入。排序状态由 IDs 唯一来源派生。动画尊重 prefers-reduced-motion，ResizeObserver/媒体查询和beforeunload监听随所属组件清理。

UI 错误边界提供重试路径；错误反馈不能泄漏凭据或后端堆栈。链接与预览 URL 限制安全协议，图片/下载展示不能接受 javascript:；代码编辑内容仅作为数据，不执行。源 Tillgate 账号密码不写入仓库、测试或设计文件。

## 7. 验收标准

组件映射逐项有实际导出、工作台场景与行为验证，不用静态标签冒充复杂能力。视觉核对覆盖 1440 与 390 像素宽度，两种主题及语言；以稳定示例与相同视口对照布局/尺寸/颜色，新增CMS组件延续相同规则并注明无源一一对应项。浏览器验证键盘焦点、横向表格、弹窗、输入法、防抖、取消/失败/重试和偏好重载保持。

四门保留原后端并纳入前端：lint 0错误0警告；typecheck 覆盖 TSX；build 包含 Next 生产构建；test 包含现有单元/数据库覆盖率、后端旅程及开发/生产浏览器冒烟。新范围统计 TS/TSX，statements/functions/lines ≥90%、branches ≥85%；不得通过排除交互源码、降低阈值或skip通过。结果记录真实用例数和四项覆盖率，并明确统计范围。

## 8. 路由与访问

本期路由及首切片props冻结在[组件映射§5](admin-ui-components.md#5-首切片冻结接口)。/去往/ui，总览/七类/列表组合均允许直接访问和刷新，开发与生产构建仅展示合成示例，不读取会话。shell账号区域使用组件工作台说明，不伪造登录用户。
