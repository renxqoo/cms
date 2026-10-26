# OneAster 界面与接口联调矩阵

状态：当前界面与HTTP契约基线，2026-10-26；事实来自当前后端operations/input schemas/DTO、OpenAPI及真实测试。完整注册76个operationId；按实际范围记录，不抄Tillgate API。

## 1. 已冻结账户与RBAC页面

| 页面/动作 | HTTP操作 | 关键契约 |
| --- | --- | --- |
| /login | POST /v1/auth/login | email/password→token/expiresAt，仅BFF保存token |
| shell注销 | POST /v1/auth/logout | 204，清cookie |
| /forgot-password | POST /v1/auth/password-reset-requests | email→202 accepted，保持反枚举提示 |
| /accept-invitation | POST /v1/auth/invitation-acceptances | fragment token/newPassword→204，不自动登录 |
| /reset-password | POST /v1/auth/password-resets | 同上，独立用途 |
| /dashboard/account | GET/PATCH /v1/me；PUT /v1/me/password | 修改displayName带version，改密撤销所有会话 |
| /dashboard/admins、/[id] | GET/POST /v1/admins；GET/PATCH /v1/admins/:id；POST .../invitations | 新建即邀请，邮件状态非送达保证；无硬删除/改邮箱/解档 |
| /dashboard/roles、/[id] | GET/POST /v1/roles；GET/PATCH/DELETE .../:id；PUT .../:id/permissions | code/isSuper不可变，完整permissionIds替换，super只读 |
| /dashboard/permissions | GET/POST /v1/permissions；PATCH/DELETE .../:id | code/scope不可变，引用阻止删除 |
| /dashboard/navigation | GET/POST /v1/navigation；PATCH/DELETE .../:id | group→page→action，可信path/icon，逐节点version |
| /dashboard/endpoints | GET /v1/endpoints；POST/PATCH/DELETE /v1/endpoint-bindings... | 真实operation+scope，不能创建任意endpoint |
| /dashboard/audit-logs | GET /v1/audit-logs | q/主体/操作/目标/UTC时间范围，完整detail弹窗，只读 |
| shell权限 | GET /v1/me/navigation、/v1/me/operations | 递归菜单与完整分页操作许可分开消费 |

所有security写仅超管可用；read仍需有效绑定，super不绕过。page/pageSize/q/sortBy/order按各端点严格白名单，不给roles发送status、给endpoints发送q等未知参数。管理DELETE用?version=N。管理员自己不能提交roleId/status。禁用角色的active账号仍可登录和自服务，不能误作无效凭据。

DTO安全投影来自apps/api/src/http/openapi/responses.ts及packages/cms/src/access/types.ts、identity/types.ts。前端不导入这些后端实现模块；新增浏览器安全schema必须由真实响应验收，不能仅照抄对象自测。

## 2. 内容与媒体页面

| 界面 | 实际接口族 |
| --- | --- |
| 集合结构/列表/编辑/单例 | /v1/collections、/:collection、/:collection/documents、/:id |
| 草稿/发布/复制/归档 | .../autosaves、publications、publication、copies；DELETE文档?revision=N |
| 版本/对比/恢复 | .../versions、versions/:versionId、version-diff、restorations |
| 回收站/永久清除 | documents?trashed=true、trash-restorations、purges |
| 计划/批量/任务 | publication-schedules、batches、jobs、jobs/:jobId |
| 文件夹 | /v1/folders，按collection与version管理 |
| 资源库/引用 | /v1/resources、.../documents/:id/references |
| 上传/字节/处理 | .../uploads（当前主体发现列表与创建）、uploads/:id/content、completions、uploads/:id |
| 原件/历史/固定引用 | documents/:id/file；media-bindings/:bindingId/file；versionId/variant/mode |
| 图片重处理 | .../documents/:id/file-processings→jobId/uploadId，后台自动提交新修订 |

默认真实集合articles/pages/media/settings，当前本地化en/zh-CN；复杂字段框架需独立真实测试集合覆盖，不往生产集合塞mock。Array/Blocks保持稳定UUID和blockType，关系写{collection,id}，编辑读取fallback=[]。后端没有文档编辑锁，不能提供伪锁操作。资源默认本地存储，可配置S3；无长期裸对象URL能力。

## 3. BFF精确契约与错误

/api/cms转发路径仅匹配已注册/v1模板，public auth操作单独处理。登录200安全返回{expiresAt}，token只进HttpOnly cookie；其他JSON/204保持后端状态与安全DTO。所有响应Cache-Control:no-store，认证资源不进入共享缓存。PUT upload content保留原始字节并串流；HEAD/GET file只放行定义的query与安全响应头。

公开/登录错误、受保护unauthenticated及过期会话检查不写cookie；改密成功和显式注销清本地cookie。旧请求迟到不能删除并发登录的新会话。错误保留code/requestId/fieldErrors及Retry-After，客户端统一本地化。version_conflict不自动覆盖；resource_in_use说明引用或保留期；endpoint_unbound说明绑定/Permission问题而不是要求重新登录。

新增部署配置CMS_API_BASE_URL、CMS_ADMIN_ORIGIN在应用config层定义，服务器只读；开发缺省127.0.0.1:3001与localhost:3000，生产显式配置并验证origin，HTTP仅loopback例外。配置不通过NEXT_PUBLIC暴露。测试URL通过既有test:e2e调度器传入Next/API进程树，不能硬占3002或使用Tillgate账户。

## 4. 首切片会话补充

POST /api/auth/expired-session验证前端当前请求携带的会话，不是新增后端会话API；同Origin验证后重新读/me，无cookie或确认失效返回204，当前有效返回409 session_changed，故障返回503，均不发送Set-Cookie。无效cookie自然到期或由新登录覆盖，避免旧401响应迟到删除新cookie。SSR只重定向登录，不在Server Component写cookie。登录/注销/改密后完整页面replace清理客户端缓存；返回目标按真实注册站内路由校验。角色元信息PATCH与授权PUT是独立保存区，不能拿同version并行提交。非幂等认证动作响应丢失只表示结果未确认，禁止盲目自动重试。
