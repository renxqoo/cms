# Collections 协作编辑与预览

状态：实施契约，2026-10-26。参考本地 Payload aebbf75；保留 Hono、PostgreSQL 与独立身份架构。

## 范围与公开契约

集合通过 lockDocuments={durationMs,heartbeatMs} 启用编辑占用；false 或未配置表示不启用。heartbeatMs 必须小于 durationMs 的一半。租约由 PostgreSQL 时钟决定，按文档唯一；主体和每个编辑器实例的 UUID 共同标识持有者，同主体不同标签页仍需要显式接管。

GET /v1/collections/:collection/documents/:id/lock 返回当前可见占用。四个锁操作接受 locale 并按该语言检查读取和写入许可。PUT 同路径以 editorId 首次获取，后续 heartbeat 带 generation 续期；有效他人租约只返回 occupied，不自动抢占。DELETE 同路径以 editorId 和必填 generation 释放自己的租约。POST .../:id/unlocks 以 generation 显式接管，需独立 documents.unlock 权限以及当前文档读取和更新许可。授权策略、主体停用及角色撤权即时参与检查；复核持有者时始终使用租约记录的 locale，以及原管理员和委托凭据共同构成的身份；凭据到期、撤销或撤销父凭据后租约立即失效。同管理员的其他凭据和浏览器会话不能续租、释放或借用该租约写入，接管仍须独立解锁许可。页面编辑器保持稳定 UUID，语言切换递增 generation，旧语言的迟到 heartbeat 和 release 不影响新租约。

数据库事务写入仍使用现有安全锁、统一内容变更 fence、修订 CAS、审计和幂等。租约检查覆盖文档保存、发布、恢复、归档、清除、关系删除副作用及资产替换/处理；服务端任务只能在租约为空、已过期或由同一发起主体持有时提交，并保留预期修订核对。锁不覆盖只读操作及复制源。前端写入通过 X-CMS-Editor-Session 传入实例 UUID，BFF 严格校验并只转发这个新增头。

集合 preview 配置包含版本化 url 函数、受信任 origins 和设备尺寸；livePreview 显式启用草稿消息同步。url 函数只消费当前授权投影，返回 URL 必须落在预先声明的 HTTP(S) origin，不接受凭据、危险协议或任意客户端 URL。GET .../:id/preview?locale=... 返回经验证的 URL、origin、设备尺寸和实时同步开关；需要预览、文档读取与 editor 许可。没有配置就没有预览入口。

实时预览在编辑表单旁边展示。iframe 仅加载配置批准且与管理端不同 origin 的页面，使用 sandbox、随机 channel、固定 origin 的 postMessage 和 source 校验握手；同 origin 配置提供真实外部链接。只发送当前可见字段草稿，不发送身份令牌、私有对象键或隐藏字段。预览网站按约定监听 cms-preview-init 并回复 cms-preview-ready；此后收到 cms-preview-update。每次草稿同步等待两秒并重新请求预览授权，失败即停止。前端按页面实例管理 iframe、监听和取消，关闭、切换文档和撤权后停止同步，取消未完成请求。

上传创建和图片重处理接受 locale。授权解析后仅在 asset_uploads.authorization_locale 保存一次语言；字节上传、完成、查询、取消和处理任务始终使用该值，后续请求不能替换语言。文档消耗 uploadId 时必须与写入语言一致；后台处理复核原语言权限和修订后提交。上传详情和列表返回 locale，恢复队列必须匹配当前编辑语言。任务和上传列表按选定语言及持久化语言同时过滤。

## 持久化、发布与回滚

0012_editor_collaboration.sql 新增 content_document_leases 及外键，并增加上传会话授权语言。不改历史迁移。运行角色精确增加租约表 SELECT/INSERT/UPDATE/DELETE。升级先停用旧 API 并排空 pending/uploading/processing/ready 上传与 queued/running 图片任务；SQL 检查任一活动记录则原子拒绝迁移。旧终态上传保留 NULL 并沿用原默认语言只读语义，约束禁止重新激活；新增会话必须有解析后的语言。迁移先于新应用上线，操作目录 reconcile 后绑定新增权限；只有绑定齐全才启用部署集合的 lockDocuments。兼容窗口为部署停写及旧实例排空，不允许旧版写入口与启用锁的新实例混跑。观测 document_locked 冲突、租约失效、接管审计、资产 forbidden/version_conflict 和迁移排空错误；确认全部实例使用新检查后结束窗口。回滚先停写、排空新实例与活动上传/处理任务，关闭 lockDocuments 后切回旧产物，新增表和列保留供审查，不能在运行中以删除租约规避锁。

0021_delegated_editor_leases.sql 在委托凭据表建立后增加 delegation_id 外键，并使升级前无法确认委托来源的租约全部到期；客户端重新获取租约。凭据清理删除时同时清除其租约。迁移与新程序同时部署，不提供管理员身份回落。回滚先停写并关闭协作锁，列和外键保留以避免身份丢失。

## 验证

公开业务和 HTTP 测试覆盖并发获取、续期代次、同主体多标签页、超时释放、显式接管、撤权、跨文档/集合、任务及资产写入、审计回滚。公开 UI 测试覆盖等待、只读、接管、卸载释放、过期暂停、定时器/监听取消；预览测试覆盖 URL 校验、不可读字段、错误 origin/source、握手和草稿更新、设备与关闭清理。最终四门与真实 Bun/Node 浏览器旅程的结果在实际执行后记录。
