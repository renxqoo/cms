# 资产后端实施与验证记录

状态：已实施，等待主线集成核销。2026-10-26。关联 collections-design.md §8、collections-collaboration.md §3；完整内容权限/文档闭环由 content 统一编排。

## 1. 当前契约与所有权

assets 公开八个集合范围操作：createUpload、writeUpload、completeUpload、readUpload、cancelUpload、download、downloadBinding、reprocess。创建、确认、重新处理使用幂等键，仅缓存资源引用；重放按当前主体/操作/文档/字段策略重新授权。上传型文档客户端仅提交 uploadId，不接受 manifestId。单个会话一个文件，批量由多个会话及逐项持久化状态组成；没有另设批量上传协议。

pending → uploading → processing → ready → consumed 为成功路径；取消、过期和失败有实际状态。完成确认及重新处理返回持久化 jobId。上传声明长度、实际字节计数、magic MIME、摘要与图片完整像素校验都生效；PDF 作为私有附件，不宣称提供恶意文件检测。PNG/JPEG/WebP/GIF 受 MIME 白名单、像素/帧/尺寸及处理期限约束。图片变体、裁剪、焦点及 EXIF 自动方向产生独立不可变清单，保留原件。

有效 pending/uploading/processing/ready 会话按数据库 clock_timestamp 计入全局及主体数量/声明字节配额。同一内容变更 advisory fence 下聚合并竞争，不能并发突破。默认由应用注入主体 100 会话/1 GiB、全局 10000 会话/20 GiB。取消、消费、失败及到期释放准入额度，物理字节仍按保留和清理协议回收。

## 2. 事务、任务与锁序

所有资产变更短事务取得安全共享锁 → 应用注入的内容变更 advisory fence → 幂等键 → 已授权的排序内容资源 → 资产任务 → 上传会话 → 排序清单 → 对象。领取/候选登记/失败/过期/清理同样先取得 fence；没有事务内网络、图片解码或慢速流。

任务有 owner、递增 generation、lease、有限 attempts。每个最终事务先按当前账户/角色/操作/文档策略重新授权，再锁任务核验代次及租约，业务写、清单绑定、审计、逐项状态同事务提交。旧代次不能写业务副作用。reprocess 在完成时调用注入的 content 事务参与能力，严格 revision CAS，创建新文档修订而不覆盖历史。

bind 消费 actor/collection/purpose/document/revision 严格匹配的 ready 会话；复用只能通过已授权来源解析的事务内品牌能力。$file 复制的媒体身份取新文档，普通媒体字段保留目标媒体身份。引用固定 source revision/path/media identity/manifest，媒体自己的旧修订裁剪后来源仍能读原清单。读清单不公开对象键。全页绑定元数据批量读取，避免每文档 N+1。

## 3. 对象恢复与外部期限

原件/变体均先登记对象候选账本再写存储。候选具有永不复用的 UUID 键和写期限；网络成功后通过代次与状态复查绑定。清单与物理对象分别登记和锁定，多个清单共享原件。释放源修订/文档时原子延长 PITR 保留窗口；历史和当前引用、任务 pin、未消费会话保护字节。清理以有界批次执行。

存储删除失败持久化 cleanup_attempts、cleanup_failure_code、cleanup_blocked；达到上限后停止自动热重试，composition 的 reconcileCleanup 由离线命令显式恢复有界失败批次。返回 retried、cleaned；cleaned 只统计最终 deleted。S3 无法证明取消的提供方写不会迟到，因此成功 DELETE 后仍保留 deleting 账本并周期复查，不虚报最终回收。直接上传/分片能力明确为 false。

S3 采用官方 SDK、条件创建及内容摘要；每次 send 有注入期限且支持外部取消。GET 初始响应完成后清除此 send 定时器，下载流继续受请求预算控制。停止时先 abort 模块任务及流，等待实际工作退出，再关闭图片/存储；无遗留定时器或未处理的 Sharp error 事件。

## 4. 本地驱动的安全前提

按用户裁决，S3 未配置时使用本地驱动，production 同样适用；完整 S3 配置自动选用 S3，显式 driver 优先。多实例本地驱动必须共用同一持久化共享卷。根目录必须归当前 POSIX UID/主 GID，权限为 0700；祖先归 root/当前 UID，禁止其他用户写，root 所有且有 sticky 位的临时目录允许。文件要求私有且为普通文件，禁止叶子符号链接和任意对象路径。

打开后、读取或写入字节前核对根 inode/dev、文件描述符与路径 inode/dev、canonical path，并再次检查根及祖先。文件描述符在失败、取消、流结束及关闭时释放。实际文件系统竞态回归在路径检查与 open 之间将根替换成 symlink，原实现读出外部测试字节，新实现拒绝。

这不是跨平台 openat 锚定沙箱。恶意同 UID 或特权进程的任意 ABA 改名、修改应用文件和凭据不属于本地驱动的隔离边界；不能把多次 lstat 当成对该攻击者的完整证明。本地部署必须满足这些权限及可信主体前提；多实例另需满足共享持久化存储要求。

## 5. 缺陷证据与验收

已取得修复前失败及修复后通过的回归：会话读取与消费锁反转导致死锁；复制 $file 继承旧媒体身份；无变体配置只检查图片元数据而接受损坏 IDAT；Sharp 活跃取消/关闭产生未处理事件并在关闭后返回成功；任务重试成功保留旧 failureCode；耗尽领取重试未将 upload 同步到失败；本地目录替换读取外部字节。另有并发配额、S3 未回复 DELETE 的期限/失败账本/显式恢复、迟到写持续清理、共享原件及历史清单授权测试。

A 独立 worktree 的完整门禁会镜像 content 的正式 catalog/schema 依赖及主线操作元数据，最终集成后必须重新执行；这些镜像不属于 A 提交。既有 Bun/Node 身份旅程通过不代表媒体 HTTP 旅程通过。实际媒体网络旅程由主线统一验证。真实 S3 账号、多故障域故障切换、PITR 恢复和容量压测未执行，不宣称完成。

A 批次最后一次实际检查：bun run lint 为 0 错误/0 警告；bun run typecheck 检查 171 文件无类型错误；bun run build 成功；bun run test 的 264 个单元/集成用例与 2 个 Bun/Node 身份网络旅程通过。全仓匹配范围实际覆盖率 statements 91.34%、branches 87.92%、functions 94.00%、lines 94.04%，既有 90/85/90/90 门槛通过。另以真实 Node v26.9.0 执行 Sharp 8×8 派生图及本地存取逐字节探针成功。媒体 HTTP/后台任务联合旅程仍由主线集成验收，不把这些数字外推为部署 SLA 或资源全链网络验收。
