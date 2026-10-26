# 内容交付应用配置

应用装配位于 `apps/api/src/bootstrap/create-content.ts` 和 `create-runtime.ts`。HTTP 仅调用注入的内容交付 API；媒体存储、预览授权和公开内容投影由业务模块负责。公开合同见 [CONTRACTS.md](CONTRACTS.md)。

`ONEASTER_CLIENT_ORIGIN` 是预览跳转的唯一可信客户端 origin，并加入应用 CORS 来源。开发和测试默认 `http://localhost:9090`；生产必须显式配置 HTTPS origin。值不能含账号、路径、查询或 fragment，不能以尾斜杠表示第二种配置形式。生产不接受 localhost HTTP 例外。

公开内容和管理操作使用独立的 PostgreSQL 限流桶。HTTP 根据实际注册的 `publicContent.*` 操作选择公开桶，管理、预览与未知操作仍使用管理桶；不根据客户端自报身份或代理头改变限流身份。`ONEASTER_PUBLIC_READ_IP_LIMIT` 默认每个 60000 毫秒窗口 6000 次，可配置为 1 至 1000000；管理桶保持每窗口 120 次。相同来源通过不同实例访问时仍消耗同一个对应桶。该限额独立于单实例 64 个活动请求准入；媒体和导出直到消费结束、取消或超时才释放准入。

公开聚合配置为 2 MiB 响应、200 次 SQL、4000 毫秒一致读期限、100 项导航和 6 项相关模型。导出配置为每批 100 项、10000 次 SQL、100000 项、32 MiB 总字节、256 KiB 单帧、15000 毫秒总期限与 2000 毫秒写等待期限。导出采用完整 NDJSON 帧和背压，不把截断结果当作成功。

预览 grant 最长 600000 毫秒，每个签发者最多 20 个活动 grant，部署最多 10000 个活动 grant。响应固定为 `private, no-store`、`noindex, nofollow` 和 `no-referrer`。读取预览资料、示例、媒体和撤销使用独立的 Bearer grant；后台签发与撤销仍使用管理会话及集合权限。日志只包含注册路由和验证后的 actor，不记录 grant。

公开 JSON 响应的强 ETag 是实际序列化响应字节的 SHA-256；响应内 revision 仍由业务内容生成。存在且授权成功的表示才能命中 If-None-Match。媒体使用内容摘要作为 ETag，支持单个字节范围、HEAD、条件请求及取消清理。预览不使用公开缓存条件响应。

受控代码示例仅根据已存储的 binding、scenario 和发布 site API base URL 生成。示例的单请求期限是 60000 毫秒，轮询间隔为 2000 毫秒，轮询总期限为 600000 毫秒，单响应上限为 8 MiB。

初始化命令是 `bun run --cwd apps/api initialize-content --email <administrator-email>`。命令隐藏读取密码，通过既有管理员登录与内容 API 写入缺失项；不直接写数据库或模拟系统权限。初始化先补齐 en 和 zh 各 13 个 v5 软件消息 namespace，再创建启用的语言记录。默认语言通过管理编辑器的原子切换操作更新；code 及消息包 identity 创建后固定，语言和消息包不归档或清除。唯一键冲突后重新读取已有项，已有语言、默认语言和翻译均不覆盖，失败后可重入。命令不初始化模型、首页或演示内容，结束时注销临时登录并关闭运行时资源。

软件消息资源与 ICU 合同位于 `apps/api/src/config/resources/`；参数、复数分支和富文本标签须与版本化合同一致。构建产物入口为 `apps/api/dist/main.js` 和 `apps/api/dist/commands/initialize-content.js`；资源分别复制到 `dist/resources` 与 `dist/commands/resources`，构建前清理旧输出目录。
