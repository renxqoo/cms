# 内容、字段与资源界面实施契约

状态：消费者方案定稿，2026-10-26；后端76操作已集成，界面实现与真实跨进程联调验收进行中。关联[应用设计](admin-application-design.md)、[界面矩阵](admin-application-contracts.md)及后端collections-ui-api三件套。本批不改变存储、业务权限或发布协议，不执行DDL和部署。

## 1. 入口与归属

/dashboard/collections展示当前主体可发现集合；/[collection]为文档列表与回收站，/new及/[id]为配置驱动编辑器，/structure展示安全结构。/dashboard/resources提供上传型集合资源与私有预览；/dashboard/jobs按集合发现持久化任务及上传会话；/dashboard/asset-cleanups只向具备security许可的主体提供受控清理账本与重试。所有页面服务端验证身份，实际数据通过封闭BFF读取并由后端再次授权。

contracts/content.ts与assets.ts定义浏览器安全DTO，不从后端实现导入。features/fields拥有字段渲染与纯数据转换；features/collections拥有列表/编辑/版本/发布流程；features/assets拥有上传/私有预览/图片；features/jobs与asset-cleanups拥有真实查询和受控操作。复用access-control、management-shared、共享query导航、现有CMS组合及七组UI出口，不再建client、store或第二套表格弹窗。

## 2. 安全元数据与字段

只消费collections.editor的实际layout、schemas、actions、locales及upload预算。read、create、update、autosave、copy intent与实际动作分开，编辑和提交不使用fallback翻译；编辑GET明确locale、fallback=[]、depth=0。layout已过滤隐藏字段，前端不从本地集合配置补回字段、默认值或选项；read intent需要id，create不得有id，回收站条目不偷偷调用普通编辑读取。write=denied只读；conditional标明提交时复核，不把提示当授权或用伪造nextData计算权利。

create/update/autosave/copy的editor请求严格不传fallback或depth；其响应允许返回后端解析出的fallback链，不能因该字段非空拒绝合法locale。受控表单数据仍只来自明确fallback=[]、depth=0的document GET，不从metadata响应链补翻译或复制其他语言文本。read intent才允许显式fallback参数，并按请求核对其响应。

元数据与数据以collection/id/locale/mode、editor.document的revision/versionId配对，并核对catalog/editor的schemaVersion/behaviorHash/mappingFingerprint。读取交错不匹配最多重取一次，仍不匹配显示资源变化并禁写，不拼接旧字段与新revision。发布、恢复、reprocess终态及权限变化后重新取得安全metadata和document。任何富文本树不能无损导入时，整字段保留原AST并切受控结构编辑，不部分导入再拼回；JSON/code/结构编辑的无效文本草稿使save/autosave/publish同时不可用，不能自动保存上一次parsed值并显示已保存。

renderer穷举当前元数据的20类节点：text、textarea、number、boolean、date、email、select、code、json、point、group、array、blocks、tabs、row、collapsible、richText、relationship、upload、join。标量、结构和扩展组件分层；同一受控value/事件用于新建、详情及批量编辑。布局节点不生成存储字段；命名tabs/group增加数据路径，非命名tabs/row/collapsible沿用父路径。join始终只读。只提交已修改且可写的字段，不把读取展开关系、join、隐藏或静态denied字段回传。

空值按候选schema表示为null或省略，不把空number转成0或把false当缺值。数字、point经独立有限数转换，point顺序为longitude/latitude；日期使用真实ISO时间并保留时区语义。JSON及code使用既有本地Monaco，JSON错误保留文本草稿并阻止提交，不假成功。min/max/length/options等用于及时反馈，draft/commit完整候选schema不能当PATCH所有字段必填；唯一性、关系及动态策略仍由后端裁决。

array/blocks新增稳定UUID，编辑/排序保留已有id，blocks保留blockType；add/remove/move是同一数据树的纯操作，取消排序不改value。多语言结构共享，不在切换locale时生成新id或复制fallback文字。关系按{collection,id}唯一身份且保留顺序，跨集合相同id不混同；选项从实际允许集合分页读取，搜索/翻页不丢已选，名称不可读时保留安全身份说明，不伪造标题。

richText保留后端v1 AST，提供段落、固定标题、列表、链接、关系和媒体节点；不暴露无法持久化的marks、标题级别或有序列表语义。拟采用已核对稳定版Lexical0.52.0及同版React/list/link/rich-text/selection/utils包，只在字段出现时按Next客户端边界懒加载，保持Tillgate主题和基础组件。它是本批完整富文本能力所需编辑内核，不替换UI体系。单一AST转换器显式验证并输出受支持节点；不能无损表示的合法树须保留原节点，并提供受控结构编辑，不能静默丢节点、引用或转换成纯文本。自定义受信任节点按type/version分发，未知适配保留数据并安全展示。URL只允许后端相同协议，渲染不执行HTML；粘贴和导入不绕过净化。注册监听/命令和编辑实例卸载时释放。

富文本无损检查按JSON语义比较，对象成员顺序无关，数组顺序、节点数量及全部值必须保留；PostgreSQL JSONB重排对象键不应改变可视编辑能力。相邻文本合并、空节点丢失和不支持的扩展仍整字段进入结构编辑。

## 3. 文档编辑状态与并发

编辑器按collection/id/locale实例化，区分服务端已确认快照、当前草稿、待确认写入及冲突。切换locale、离开页面及历史导航沿用真实未保存更改保护；取消离开保留字段和光标。创建成功使用返回id进入详情；单例以真实list结果决定打开或创建，409后核实，不猜固定id。

同一navigation adapter下的页面与嵌套弹窗聚合dirty：最外层只保留一个导航订阅、一个原生离站监听和一份确认；内层登记自身dirty并在卸载时移除，不关闭保护或建立第二套导航器。聚合scope按React树实例创建，不跨请求共享，跨adapter互相隔离。ManagementDialog接受可选受控dirty，传入时使用调用方完整派生草稿状态，未传保留原表单变化追踪；pending和未确认locked始终受保护。图片拖拽、裁剪和变体按钮等无原生change事件的编辑由该受控dirty覆盖。

所有写动作共用单个通道：手动保存、自动保存、发布/撤回、归档/恢复、历史恢复、复制、移动和图片替换不能并发复用revision。自动保存仅drafts且具备真实许可，用户启用后在一次编辑静默窗口排一个定时器，未保存变化才提交；正在写时只保留最新待保存草稿，不重叠发请求，卸载/关闭自动保存清理。返回revision来自服务端，不自行递增。请求发出后的继续编辑通过草稿代次保留，不用旧响应覆盖新输入。

单通道覆盖异步工作全生命周期：replace从创建会话锁定原revision开始，到ready后绑定/明确取消并核实才释放；reprocess从POST到持久任务终态和metadata/document重读完成期间保持占用。202不是释放锁的成功终态。期间允许继续编辑本地草稿代次，但暂停save/autosave及其他文档变更；未知结果继续核实，不换revision重发。

手动保存和自动保存均使用真实data补丁/locale及当前revision；幂等动作沿用同意图UUID，未知结果暂停通道、核实后恢复，不自动换key重试。409保留草稿并读取当前版本，展示两份状态供显式重载或重新编辑，不自动覆盖。发布验证完整候选，错误按字段/locale显示；成功状态由返回publishedVersionId计算，不能拿刚提交的revision假设已发布。不存在编辑锁服务，不提供虚假锁、心跳或接管。

列表使用当前collection安全fields构建可选列、queryable筛选与排序，严格匹配q/where/sort/page/pageSize/mode/trashed/folderId等白名单；搜索与快速筛选复用共享pending URL状态。回收站只读列表与恢复/永久清除，purge受保留期和引用约束，确认中说明不可逆，失败不从列表假删。批量只提交显式选择的id/revision及受支持action，显示同步或持久化job真实逐项结果，不把202当全部完成。

批量update最多显式10项；顺序读取每个id的update editor（无fallback/depth），核对该项revision/versionId、catalog schemaVersion/behaviorHash/mappingFingerprint，以及完整layout与update action投影一致。缺失权限、读取失败、交错修订或异构投影均禁提交并提示逐条编辑。共用20字段renderer从空补丁开始，只提交用户明确修改字段，不将首条值复制给其他条。archive/copy/restoreTrash最多100项且保留各自id/revision。批量读取不超过10次metadata请求，不按100项同时展开。

版本列表/详情/差异使用真实versionId，恢复是完整多语言历史快照，确认说明影响；不把所选locale预览误称只恢复一种语言。计划发布提交当前revision、指定versionId和UTC executeAt，通过可发现publication job读取定位字段、真实状态和取消结果，刷新可重新发现，不只依赖内存jobId。

文件夹为真实树及version CAS，新建/改名/移动/删除受API约束；移动文档使用document PATCH folderId与revision，不能修改客户端行后声称成功。结构视图只读当前安全布局/schema及版本标识，不生成配置保存接口。

文件夹PATCH/DELETE结果未知时不走幂等重放：记录实际提交的CAS意图，主动、可取消地完整重读folders.list。PATCH仅同id、version=提交version+1且name/parentId精确相符才确认；DELETE仅完整成功列表中id缺席才确认。读失败、撤权、原version未变或其他版本内容保持草稿及blocked；显式采用仅使用本次新鲜成功观察，重新检查读取和写许可，不自动升级version。创建保留原UUID与payload显式重放，不能用同名猜成功。结果未知可经二次明确确认关闭，刷新目录并保留未确认提示，不伪称远端取消或操作成功。

## 4. 字节客户端与上传

持有lease不授予操作权限。现有controller在任何创建、重放POST、上传字节、complete、consume或DELETE前核对最新操作许可与读取依赖；readOnly禁止新写，已有job可按剩余读许可核实终态。未知receipt、当前lease占用和旧metadata均不能作为重发授权，保持原key/revision/意图；失效只暂停，不丢队列或谎称远端取消。

扩展唯一requestApi，按operation.responseKind处理JSON/204或私有流，不增加第二套身份传输。流成功投影为{blob,filename,contentType,etag,bytes}，错误继续使用同一ApiResult。响应按实际字节上限32MiB、90秒、64KiB读取并取消超限流，文件名净化且无存储key。可选onUploadProgress只对bytes操作生效：浏览器用原生XHR报告真实已发送字节，不以定时器模拟；无进度消费者仍沿用既有fetch路径。abort/timeout/网络/非JSON错误统一处理，移除所有XHR监听和定时器，不透传Bearer。

上传预算来自当前editor.upload，purpose=create或replace；replace必须有documentId/revision。流程真实执行createUpload→PUT原始application/octet-stream→completeUpload→readUpload轮询ready→文档create/PATCH uploadId消耗，不把处理ready当已附加成功。队列并发预算在feature配置层且有上界；实际接收进度只表示浏览器发送，处理阶段显示服务器状态。所有所需读写许可和读取依赖可用后才启动，不留下只能创建却不能读取结果的流程。

已失败会话不能重传PUT；明确重试创建新会话。取消调用真实cancel，consumed/resource_in_use显示实际原因。离开或卸载终止前端请求和轮询，不虚称远端任务已取消；可通过真实listUploads恢复发现。没有分块续传/跨刷新字节进度则不展示这些能力。replace冲突保留结果说明，不能自动把旧revision上传绑定给新revision。

同一集合的旧metadata仅用于保留现有队列上下文，重读loading/failed或许可暂不可用时禁止选择新文件和重试写入；metadata恢复ready且动作允许后才重新启用。既有队列与服务端会话不因短暂重读失败被当作已取消或丢弃。

队列与文档工作控制器都接收必填实时许可查询，无缺省放行。创建、字节发送、完成、文档消耗、图片处理和取消逐次检查操作及流程依赖；readonly和metadata失效门控已有等待项，不只禁用选择按钮。队列保留文件、会话和幂等标识，恢复依赖后才启动等待项；已接受会话和持久任务仍按当前读许可核实。缺少处理回执时，核实与取消不得绕过撤权重放POST，重新获准后仍沿用原lease、revision和key。

## 5. 私有预览、图片与恢复

私有预览只从认证BFF GET取得Blob；URL按文档/版本/variant身份缓存于组件生命周期，替换、删除、卸载、撤权失败均revoke。固定历史媒体通过来源document的bindingId下载，不取资源当前版本；无裸object key、任意代理URL或外链manifest。PDF等不安全可执行格式不作为HTML注入，图片只按真实MIME展示；下载和预览错误保留权限语义与requestId。

图片控件从真实width/height将归一化crop转像素整数并约束边界，focal保持0..1；variant的尺寸/fit/format/quality及数量按metadata实际预算。reprocess使用当前revision和recipe，202通过持久任务跟踪；成功自动产生新文档revision，再重新读取，不重复PATCH uploadId。失败保留编辑和原文件，新的重试是新任务意图，不重放已经失败的旧job。

资源恢复复用回收站和完整版本恢复，历史固定字节与引用保留规则由真实接口验证。asset-cleanups只展示安全账本投影及blocked重试，POST {}带同意图幂等键返回202仅表示受理；界面不声称已经物理删除或绕过保留期/引用/租约。当前有效super的security许可不能由普通permission扩大。

## 6. 任务、轮询与验证

429、失败和等待预算耗尽产生的暂停需要显式继续；隐藏再显示页面不得覆盖该原因或自动恢复读取。只有因hidden暂停的请求可在重新可见时按原截止时间恢复，Retry-After在显式继续时仍生效。

jobs/uploads列表按新后端契约的固定顺序和严格filters，在权限过滤后的rows/total上分页，不前端分页后伪造总数。轮询预算在feature配置层：可见页最多两个轮询器，列表最短10秒、选中详情最短5秒；上传队列最多两个活动会话且各最短10秒，不同时启动逐行列表轮询。整段自动等待最多5分钟，超时暂停并提供显式继续核实，远端任务不宣称取消。hidden、terminal、429和离页停止计时器和请求；恢复可见仍受原截止时间约束。失败显示真实Retry-After，不在后台自动重试429；考虑BFF出口IP120/min和逐operation60/min预算，不为每行启动定时器。切换collection、页或身份清理旧请求，拒绝迟到结果。详情按kind使用安全DTO，不输出原始provider错误或其他actor的私有会话。

先行验收覆盖20节点和结构操作、空值/数字/日期、关系身份/分页、多语言共享ID及fallback=[]；富文本节点无损和危险URL/粘贴；保存/自动保存串行与晚响应/409/未知结果；发布/版本全locale恢复/回收站/计划与批量逐项终态；真实PNG/PDF字节经Chrome→Next→API→存储、上传取消及新会话重试、像素crop与reprocess revision、私有当前/历史binding下载及撤权、Blob/定时器/监听释放；jobs重新发现、cleanup受理而非假完成。所有默认组件冒烟继续，新增旅程连接Bun API/Next dev和Node API/Next prod，覆盖率及四门不放宽。
