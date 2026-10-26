# 语言目录不变量

状态：已实施，待根工作区统一生成、浏览器旅程、四门及独立审查。用户裁决：语言 code 使用 canonical BCP47 且长度最多 32 个 ASCII 字符，与运行时、发布及预览语法一致；它是长期翻译身份，创建后固定；语言禁用保留 supported 及所有内容，不以归档或清除删除语言。消息包 identity 为 contractVersion/locale/namespace，创建后固定，只编辑符合当前软件合同的 messages；本业务不提供消息包归档或清除。

## 方案

非空目录始终恰好有一个 enabled 默认语言。普通编辑不能改 default；管理编辑器为已启用且非默认语言提供“设为默认语言”。`POST /v1/collections/languages/documents/:id/default-language`，operation `languages.setDefault`，必填 revision 与 expectedDefaultCode，并使用现有稳定幂等键。返回更新后的 ContentDocument。目标 revision 或原默认 code 过期返回 version_conflict；未启用目标、缺失或不合法的软件消息返回 invalid_input；权限不足返回 forbidden。空目录仅用于安全初始化，不对外提供语言列表。

操作复用安全事务、内容 mutation 资源锁、集合访问策略及逐文档 documents.update 重新授权。新旧语言均通过既有 saveInTransaction 写不可变版本和审计，最后统一检查默认及软件消息不变量；任意失败回滚全部状态。并发切换使用 expectedDefaultCode 决定唯一胜者，不允许静默覆盖另一管理员已完成的切换。无 content 物理 SQL、新表或独立权限通道。

每个启用语言必须有当前 contract 完整且合法的软件消息 namespace。禁用语言仍存在 supported 中；启用检查在提交前执行，不能仅依靠公开读取报错。消息包 identity 固定且禁止归档/清除，合法 messages 更新保持完整性。初始化 missing-only 先创建 en/zh 的全部消息包，再创建启用语言；因此不存在初始化例外或任意创建绕过启用检查。中断只留下可重入的缺失项，不覆盖已有翻译。

管理按钮使用当前编辑器权限、版本和请求设施。关闭、切换文档和卸载取消读取/请求，晚响应不更改新页面状态；成功重新载入编辑器。默认字段显示只读，创建记录时仍可声明第一个默认。

## 实施和验收

先以真实隔离 PostgreSQL 复现 code 更名、非默认语言归档、缺消息启用和默认无法切换；再实现字段/集合访问策略、消息完整性校验和原子操作。覆盖未授权、过期版本/默认、并发切换、第二条写入失败后的版本/审计回滚、缺消息启用回滚、禁用保留翻译、初始化中断重入与并发。UI 验证可见性、成功刷新、失败反馈和取消；跨进程旅程沿现有管理装置增加语言默认切换。配置生成物由根集成后统一重生。本子任务交付未提交 delta，根统一执行四门和独立对抗审查。


## 已执行验证

隔离 PostgreSQL、软件初始化、动态语言映射、管理组件和操作合同合计 7 个文件、72 项测试通过。针对新增语言管理模块的覆盖率为 statements 94.17%、branches 87.30%、functions 100%、lines 98.83%，所运行覆盖率门禁通过；该数字不代表全仓覆盖率。主项目 566 个文件、管理端 821 个文件类型检查通过，本任务代码的类型感知 lint 与格式检查均为零问题。最初三个缺陷与超长 canonical code 的回归均取得真实修复前失败证据。

普通内容写入沿用 200 次 SQL 和 2 MiB 返回预算，语言目录上限 20 项，当前软件合同每语言 13 个 namespace。原子切换复用现有资源锁，不创建后台任务或轮询。管理请求沿用 15000 毫秒期限和 AbortSignal；组件卸载取消请求并忽略晚响应。浏览器旅程已追加到既有 admin-content-editor 文件，须在根统一生成配置后通过 test:e2e 执行。本工作区未运行全仓四门，未提交或 push。
