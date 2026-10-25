# OneAster CMS 组合组件契约

状态：已核销，2026-10-26；本批次补充[UI设计](admin-ui-design.md)和[组件映射](admin-ui-components.md)。本文件只定义本期实际组合组件，不增加真实后端接口或存储承诺。

## 1. 所有权、入口与错误

实现与类型位于 apps/admin/src/components/cms，各内聚组件文件直接导出公开组件和所需类型，不建平行UI实现或根桶。工作台消费这些组件的合成数据与文案分别位于 features/ui-lab/cms-showcase.tsx、cms-messages.ts及cms-showcase/内聚子场景目录；生产组件不含示例。通用Button/Input/Dialog/FormDialog使用@new-cms/ui精确入口，文案由props注入。

所有可异步操作接收AbortSignal，失败返回显式status:'error'及可展示message；抛出异常使用调用方注入的errorLabel呈现。明确status:'success'才触发成功后的UI变化。关闭或卸载取消在途操作，过期结果不覆盖新会话。客户端取消不能声称撤回已经提交的服务端写入。组件不展示异常堆栈或原始未知错误对象。

## 2. 关联选择与媒体关系

RelationshipValue包含collection:string、id:string、label:string、available?:boolean；稳定身份为两个独立字段组成的复合键，内部编码必须无碰撞，不直接拼接未转义的分隔字符串。RelationshipValue可携带previewUrl?:string用于可访问的受控媒体预览；RelationshipOption增加disabled?:boolean。collections为只读{id,label}列表。

RelationshipInput使用判别联合：mode:'single'时value为RelationshipValue|null、onChange接收相同形状；mode:'multiple'时value为只读RelationshipValue数组、onChange接收数组。公共输入包含label、collections、options、appearance:'select'|'drawer'、readOnly、maxRows、filterOption、onCreate?(collection)、onEdit?(value)、labels。单值上限为一，多值上限来自maxRows；达到上限仍允许移除已选项。

loadOptions可选，签名为({query,collection,signal})=>Promise<readonly RelationshipOption[]>。每次查询或集合变化先abort旧请求，新结果只在本次请求仍有效时使用；卸载取消。查询异常显示errorLabel及重试入口。同步options同样消费query与filterOption。未知集合、disabled、available:false及过滤不通过的选项不可新增。已选但不再存在/不可用的值保留并标记，不静默删除；可用性共同检查value.available、同复合身份options项的available以及collection是否仍允许，允许集合撤回后也保留原值并标记。同步options未命中视为失效；异步查询未命中不代表文档不存在，不因当前搜索或分页遗漏标记失效。readOnly仍显示值但不允许新增、移除、排序、创建或编辑。

选项与所选项有可访问名称；多选复用SortableList，完整注入roleDescription及其他辅助文案；zh为“可排序项目”、en为“Sortable item”，不保留英文fallback。多选以键盘上移/下移及可见拖拽把手改变顺序，顺序事件只重排已有复合身份。抽屉与内联共享同一选择规则。创建入口以collection ID发事件，编辑入口以完整value发事件，不猜测文档URL。

UploadInput组合RelationshipInput，代表媒体集合文档的关系，不等同文件编辑器；displayPreview显式控制已选媒体缩略图，预览由受控值或选项中的安全previewUrl提供，缺失/失败使用共享Thumbnail回退。它接收相同mode/value/selection约束及可选onFiles事件；只有显式allowCreate且非readOnly才显示创建/文件摄取。Choose existing进入关系选择；Create new发出创建事件；本地文件只交给调用方，不伪造已保存媒体文档。

## 3. 文档动作与批量结果

DocumentActions公共事实：mode:'create'|'update'、draftsEnabled、status:'draft'|'published'、dirty、busy、uploadPending、permissions:{create,update,publish,delete}、previewUrl可选，以及onAction(action,{signal})=>Promise<AsyncResult>。动作词表为save、saveDraft、publish、unpublish、delete；预览是安全URL导航，不以异步保存操作实现。

| 条件 | 允许的动作与状态 |
| --- | --- |
| 新文档 | 写动作需create权限，不显示删除/撤回 |
| 已有文档 | 保存/草稿需update权限且dirty；删除需delete权限 |
| draftsEnabled=false | 使用save；不显示草稿、发布、撤回 |
| draftsEnabled=true | 使用saveDraft；publish需publish权限；只有已发布文档显示unpublish |
| busy或uploadPending | 写动作禁用，操作不重复发送 |
| 未提供安全预览URL | 不显示预览；仅接受http/https和站内路径 |
| delete或unpublish | 先确认，再执行；失败保留确认内容并显示错误 |

Busy、error和最后成功动作属于实例UI状态；外部业务事实不因点击动作自动假定改变。批量组件BulkDocumentActions接收selected:{collection,id,label}[]、action及onAction(action,{items,signal})；结果为每项{collection,id,status:'success'|'error',message?}。仅展示返回项的真实结果，缺失或重复结果视为无效反馈并显示errorLabel，不以整体resolve冒充全成功。取消后不接收旧结果。空选择或busy禁用。批量delete/unpublish同样先经共享ConfirmDialog确认，确认label/title/description/close文案由labels注入；取消后不调用操作，确认中的失败保留弹窗，关闭/选择变化取消信号且忽略迟到结果。

## 4. 文档状态与离开保护

DocumentState呈现受控lock:null|{ownerName,isOwnedByCurrentUser}、conflict:boolean及dirty状态；takeover/restore由注入回调执行并先确认。确认与在途操作绑定受控lock的ownerName/ownership、conflict及对应回调是否可用；这些事实改变后关闭确认、abort旧任务，忽略晚结果，事实恢复也不自动重开旧确认。dirty或显示文案变化不使仍有效的动作会话失效。它不生成锁ID、租约或后台续租。

导航协议唯一类型源为components/shell/navigation/types.ts，CMS仅通过import type消费，不反向导入shell运行实现，不保留同名重导出或旧协议别名。useUnsavedChanges与UnsavedChangesGuard消费导航适配器。NavigationAttempt包含稳定id、href和kind:'push'|'replace'|'traverse'；适配器subscribe(listener)返回清理函数，commit(attempt)执行一次已批准目标，cancel(attempt)清除已拒绝目标。commit/cancel仅接受当前attempt.id且幂等；过期目标不可重放。适配器必须在实际Link、程序化跳转及历史前进/后退入口拦截目标后发出attempt；历史处理由shell适配器负责先恢复当前历史位置，确认后重放原目标。禁止仅在工作台手动开模态而没有接线真实导航。

每页由页面owner聚合所有dirty状态，只订阅一个guard；adapter重复订阅显式拒绝，StrictMode清理后允许再次订阅，不引入多guard确认协议。guard同时暴露requestNavigation(attempt)供明确程序化入口调用。dirty=false立即commit，dirty=true保留第一个待确认目标，重复点击不覆盖目标或打开多个弹窗。取消清空待确认目标、保留编辑输入；确认清空目标后commit恰好一次。dirty变为false时已有待确认目标可继续由用户确认/取消，不自动跳走。卸载清理订阅，beforeunload仅在dirty=true时安装，原生卸载提示交浏览器处理，组件不自定义浏览器提示文本。

## 5. 文件摄取、文件编辑与预览

Dropzone接收limits:{maxFiles,maxBytes,accept:readonly string[]}、disabled、label/description/chooseLabel等labels、onFiles(files)、onReject(rejections)。accept支持MIME精确值、MIME通配符与文件扩展名，输入在浏览器做有界预检，实际类型验证归后续服务端。拒绝项包含file与reason:'count'|'size'|'type'。每次摄取按输入顺序选择可接收项，数量/大小边界独立测试；空文件也受类型规则约束。

文件来源为原生file input、拖放与Dropzone聚焦区域内的粘贴。未聚焦区域的粘贴不全局截获；disabled时不接收任何来源。文件input读取后清空，使选择同名文件仍能再次产生事件。安全远程URL是Upload的独立表单入口，onRemoteUrl(url)只发事件，接受http/https协议，不执行浏览器抓取。

Upload的maxFiles约束整个当前队列；新增摄取使用maxFiles减现有items数量作为剩余预算，替换维持原有条数。Upload是受控文件编辑UI，items为只读{id,name,mimeType,size,progress,status,error?,file?,url?,width?,height?}数组，status为queued/uploading/processing/ready/error/canceled。onFiles/onCancel/onRetry/onReplace/onRemove分别表示用户意图；items中的状态事实由调用方或未来实际传输器更新。上传/处理态显示实际progress；error/canceled可以显式重试；replace传入文件及目标id；remove传id，不暗示服务端永久删除。customActions允许消费方组合额外动作。

useFilePreviews(files)为本地File提供预览URL映射，同一File实例最多一个活跃URL；文件移除、替换及卸载时回收。远程url只接受http/https或站内路径，本地预览URL来自该hook；不信任任意data/javascript协议。FileDetails呈现名称、MIME、字节数、尺寸、URL与可选操作。PreviewSizes接收显式ordered variants，切换实际预览及对应元数据；原图也是一个明确variant。

## 6. 图片调整

ImageAdjustments接收image:{src,alt,width,height}，value:{crop:{x,y,width,height},focalPoint:{x,y}}和onChange/onApply。所有坐标以原图宽/高归一化到0..1；crop宽高为正，x+width与y+height不得超过1，最小宽高是原图一个像素。原图width/height必须为正整数；无效输入显示错误并禁用Apply，不静默产生NaN。

控件提供可视裁剪区域、焦点指示、明确标记的数字/滑块输入及键盘操作；焦点也可通过图片区域指针定位。每次用户修改夹紧到合法边界，crop不改变原始文件；Apply只输出{crop,focalPoint,pixelWidth,pixelHeight}，pixelWidth=max(1,round(crop.width*image.width))，pixelHeight对应高度。不在组件里完成图片重编码或上传。

## 7. 先行测试与工作台场景

关系测试覆盖同id跨集合、单/多选、过滤/上限、保留失效值、同身份选项失效与允许集合撤回、异步分页未命中、readOnly、创建/编辑、抽屉键盘关闭、排序、异步查询取消与旧结果迟到。动作测试覆盖上表交叉条件、重复点击、显式失败/throw、关闭取消、批量部分失败与结果缺失。状态测试覆盖锁/接管确认、锁消失/本人锁/占用者改变、冲突撤回、回调撤回、旧任务取消和晚结果隔离、dirty与文案变化维持会话、适配导航、Link/程序化/历史适配、取消保持与确认一次、beforeunload安装清理。

摄取测试覆盖选择/拖放/聚焦粘贴、禁用、类型/大小/数量边界及同名重选；文件编辑测试覆盖各状态、取消/重试/替换/移除事件、安全URL、预览切换、object URL回收。几何测试使用人工算例：800×600原图、crop={x:.25,y:.25,width:.5,height:.5}应输出400×300；越界输入被夹紧，键盘焦点移动输出合法归一化坐标。

工作台在documents类展示关系与文件编辑；文档操作的回调明确为本地事件验证，展示失败/部分结果而不是实际发布成功提示。至少一个dirty编辑区接入shell实际导航适配器；模拟示例与生产组件通过props分离。
