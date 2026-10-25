# OneAster UI 组件映射与单元契约

状态：定稿，2026-10-26；来源为[Payload UI Components](https://payloadcms.com/docs/ui-components/overview)七类39篇指南，每篇可能含多个组件。对齐其交互能力，采用OneAster/Tillgate视觉及本项目类型，不提供Payload API兼容层，不依赖@payloadcms/ui的服务端Provider。

## 1. 全量映射

| # | Payload指南 | OneAster实际能力 | 所属层 |
| --- | --- | --- | --- |
| 1 | Button | 主/次/危险/图标/链接按钮，busy与禁用 | ui/primitives |
| 2 | CopyToClipboard | 复制、成功/拒绝反馈、计时器清理 | ui/feedback |
| 3 | Hamburger | 可访问导航开关，展开状态与动画 | ui/navigation |
| 4 | Link | 通用安全链接/Next适配、外链状态 | ui/navigation + shell |
| 5 | Navigation Controls | 分组/展开/收起、稳定group ID偏好保持、NavToggler | ui/navigation + shell |
| 6 | Step Navigation | 路由面包屑设置/清理，末项当前页文本 | ui/navigation |
| 7 | CodeEditor | 按需代码编辑、高亮、只读、主题 | ui/forms |
| 8 | DatePicker | default/dayAndTime/dayOnly/monthOnly/timeOnly、min/max、清空null、格式 | ui/forms |
| 9 | Field Labels and Messages | 标签、必填、描述、字段/表单错误 | ui/forms |
| 10 | Text Inputs | 文本/多行/密码、多值文本增删排序及状态 | ui/forms |
| 11 | Checkbox and Select Inputs | checkbox/radio/switch/原生select及多选 | ui/forms |
| 12 | PillSelector | 单/多项pill选择、拖拽排序与禁用 | ui/forms |
| 13 | ReactSelect and Select | 分组/搜索、单多选及排序、清空、creatable、异步/空状态 | ui/forms |
| 14 | Relationship and Upload Inputs | 关联内联/抽屉单多选、权限/创建编辑/上传选择 | admin/cms |
| 15 | SearchBar | 提交/防抖、清空、IME、取消、URL适配 | ui/forms + ui-lab |
| 16 | TimezonePicker | 可配置时区列表、搜索、保持时区ID | ui/forms |
| 17 | AnimateHeight | 动态高度、观察器清理、减少动画 | ui/layout |
| 18 | Card | 内容/动作/导航卡片 | ui/layout |
| 19 | Collapsible | 受控展开、键盘和禁用 | ui/primitives |
| 20 | Gutter | 与admin一致响应式内容边距 | ui/layout |
| 21 | Banner | info/success/warning/error及操作/关闭 | ui/feedback |
| 22 | ErrorPill | 紧凑错误数/跳转到错误 | ui/feedback |
| 23 | Motion and Loading | 进度/spinner、共享loading来源与并发计数、表单联动、真实路由过渡/取消 | ui/feedback |
| 24 | Pill | 状态/可移除标记 | ui/primitives |
| 25 | ShimmerEffect | 骨架与内容占位，减少动画 | ui/feedback |
| 26 | Icons | Lucide接口图标、大小/语义与纯装饰区分 | ui/primitives |
| 27 | List and Pagination Controls | 搜索工具栏、列/行排序、页长与页码修正、锁定行/全选/批量操作 | ui/data + admin/cms |
| 28 | Table | 类型化列/行、排序、选择、加载/空/错误、横向访问 | ui/data |
| 29 | Table Cells | 文本/布尔/数字/日期/状态/关联/操作等值展示 | ui/data |
| 30 | Thumbnail | 图片/文件类型/缺失/失败fallback及替代文本 | ui/data |
| 31 | Draggable Sortable | 指针/触摸/键盘、把手、排序/取消 | ui/data |
| 32 | Modals and Drawers | 模态/确认/表单弹窗、抽屉、焦点及异步错误 | ui/primitives + feedback |
| 33 | Popup and PopupList | 菜单/分组/禁用/危险动作与浮层 | ui/primitives |
| 34 | Tooltip | 鼠标/焦点说明、触发器可访问性 | ui/primitives |
| 35 | Document Actions | 保存/草稿/发布/撤回/预览/批量及部分失败 | admin/cms |
| 36 | Document State | 锁/接管、未保存离开、冲突与恢复受控UI | admin/cms |
| 37 | Dropzone | 文件选择/拖放/聚焦粘贴、预算反馈 | admin/cms |
| 38 | Upload | 队列/进度/取消/重试/替换/移除与本地预览 | admin/cms |
| 39 | Upload Helpers | 文件详情、派生尺寸、裁剪/焦点与图片调整参数 | admin/cms |

## 2. 底层公开入口

每个实际组件模块使用packages/ui manifest逐项声明子路径；不建根桶export *或通配出口。通用样式只有一个styles.css入口。所有公开接口必须有实际工作台或其他组件消费者，原语允许紧密协作子组件同文件导出，不机械每函数一文件。

首切片冻结契约如下，后续扩展不得复制平行实现。公用行为基线：受控value/open/selected IDs +事件；文案、格式/语言、大小/数量/防抖配置由调用方注入；disabled/readOnly、aria-invalid、busy和错误可观察。可异步操作统一接收AbortSignal与明确success/error结果，不能返回void后自动当成功。

## 3. 验收场景组织

工作台按七类展示全部条目，每项提供实际可操作示例和状态切换；样例事件显示其值/状态变化，说明本地示例，不以Toast冒充实际发布或存储成功。业务组件的网络数据由受控props/函数注入，本期装置演示失败、取消及部分结果，不建立假API端点。

列表场景组合PageHeader、ListToolbar、SearchBar、筛选、DataTable、行菜单、FormDialog与Pagination，检验组件协作与真实URL状态；文档/媒体场景组合状态、权限矩阵、关系抽屉和上传控件，检验关闭、替换和失败恢复。登录表单示例只有输入和提交校验，页面明确不是已接入认证的入口。

UI文案集中维护zh/en目录，通用ui组件只接收调用方文案；测试同时验证可访问名称和界面文案，不靠源码字符串判断。所有完成记录必须指向真实实现与运行场景；没有实际能力的行保持未验收，不能因为有一个同名导出而标记完成。

## 4. 方案审查处置

2026-10-26独立审查指出组件族子能力遗漏、导航偏好/面包屑生命周期与文档状态输入不足，已补入映射、设计与测试计划。组件族不能以单个同名展示卡验收。导航分组偏好使用稳定ID，不使用翻译标签作键。

## 5. 首切片冻结接口

精确公开子路径为 @new-cms/ui/actions、forms、layout、feedback、data、overlays、navigation、styles.css；各入口显式导出实际组件与类型，不使用export *。

DataTable<Row>：columns为只读{key, header:ReactNode, cell:(row)=>ReactNode, align?, sortable?}；rows只读；rowKey:(row)=>string；sort可空{key, direction:'asc'|'desc'}；onSortChange接收该值或null；selectedIds与onSelectionChange接收稳定字符串ID数组，isRowSelectable可限制锁定行。loading、error、emptyLabel、loadingLabel及retryLabel/onRetry负责状态反馈。分页由独立Pagination组合，表格不自行切片。

FormDialog：受控open/onOpenChange，必填title、closeLabel、cancelLabel、submitLabel、errorLabel；可选description、trigger、submitDisabled、children。组件拥有唯一原生form，children只放字段，footer提交按钮关联此form。onSubmit({signal,formData})返回Promise<AsyncResult>；AsyncResult为{status:'success'}或{status:'error',message:string,fieldErrors?:Readonly<Record<string,string>>}。字段错误既可通过Field接口展示，也在可聚焦错误摘要中关联字段。确认弹窗复用异步机制，不建立第二套表单提交实现。

SearchBar：受控value、onValueChange、onSearch；mode为{type:'submit'}或{type:'debounced',delayMs:number}；label/searchLabel/clearLabel/placeholder由调用方传入。输入调用onValueChange，提交/防抖/清空调用onSearch；清空提交空串。IME组合期间不搜索，外部value改变（例如URL后退）取消旧定时并回显当前值，不重新提交外部值。

Pagination：page/pageSize/total、onPageChange和可选onPageSizeChange(change:{pageSize:number,page:number})/pageSizeOptions受控输入；previousLabel/nextLabel/pageLabel及totalLabel由应用格式化。改变页长只发一次包含pageSize与page:1的原子事件，不同时调用onPageChange；0条数据呈现空态，无越界事件。

首切片工作台URL：/重定向/ui；/ui为总览；/ui/lists为组合列表场景；/ui/actions、/ui/inputs、/ui/layout、/ui/feedback、/ui/data、/ui/overlays、/ui/documents为七类。所有路由允许直接访问/刷新，仅展示合成示例；构建后同样可用于验收。shell账号区显示‘组件工作台’，不制造已登录用户。后续真实后台的会话与权限在其业务阶段接入。

首切片接缝修订：分页页长变更原先两个回调会在URL适配中创建两条历史，已裁决为单次原子事件并统一所有调用方与回归测试，不保留旧签名。

## 6. 全量批次的重组件契约

DatePicker由root实现，value为Date|null，onChange返回相同形状；日期/时间按UTC日历坐标解释和展示，不隐式转换为用户本地时区。referenceDate为调用方明确提供的空值日历锚点；appearance支持五种已列模式，minDate/maxDate、readOnly/disabled、monthsToShow(1|2)、timeIntervals由输入控制。format(value,appearance)及日期/时间/清空/月份导航/错误文案由调用方注入，dayOnly展示月日、monthOnly展示月份选择，空值清除必须发null。日期选择器使用共享Popover及react-day-picker；数值投影、上下限比较和时间组合使用同一公开规则，非法Date有可见错误并不发送非法值。首期示例明确标记UTC，IANA时区选择单独保留标识符，未来业务适配定义时区解释。

CodeEditor由root实现，输入value/onChange、language、readOnly、theme、label/loadingLabel/errorLabel、minHeight/maxHeight与assetBaseUrl。Monaco按需加载，文件内容仅作为数据；静态引擎及worker资源从当前安装版本生成到admin public/editor，开发/构建前准备并在git忽略生成目录，不从第三方CDN取代码。assetBaseUrl是本部署统一且稳定的资源配置，不是用户输入；每个编辑器使用独立model，不跨表单共享内容；卸载释放model、editor和尺寸监听，加载失败可见并经页面错误恢复重试。代码编辑与只读必须有真实浏览器验证，不能只测试mock wrapper。高度预算为调用方正数且max>=min，随内容有界调整。

SortableList<T>由root实现，items/getId/onChange/renderItem(item,handle)/getItemLabel受控，支持orientation='vertical'|'horizontal'，labels包含listLabel、handleLabel、instructions及start/move/end/cancel反馈；所有标签由调用方注入。稳定ID必须唯一且非空，非法输入呈现错误；disabled或特定item不可排序时不发事件。指针/触摸/键盘由一套dnd-kit装置协调，取消/无落点/同位置不变更；有效落点仅重排原items，renderItem负责使用可见handle。Pill、多值文本、Select标签和关系选择复用该能力，不再建立第二套拖拽引擎。真实浏览器验证键盘与指针重排，单测验证无目标、禁用、相同ID和越界事件。

该批次测试先于实现明确：日期五模式/清空/边界/时分/只读/UTC；代码真实加载/编辑/只读/主题/高度/模型监听释放；排序结束/取消/唯一ID/禁用与键盘。root拥有这些内聚文件及advanced测试，foundation拥有其余通用组件与分组出口，完成后明确导出，不创建未实现别名。
