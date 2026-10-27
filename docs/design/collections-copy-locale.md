# Collections 复制语言

新增 documents.copyLocale，POST /v1/collections/:collection/documents/:id/locale-copies，要求幂等键，输入 revision、fromLocale、toLocale 与可选 overwrite，默认 false。两个语言均为单一已配置语言，不能使用 all、同语言或 fallback。返回目标语言的当前安全文档投影。它在现有文档上产生草稿修订，不属于创建副本，disableDuplicate 不关闭它。

源语言和目标语言分别检查文档读取权限，目标语言还检查 documents.update、文档 CAS、字段写入策略、引用候选、唯一性与编辑租约。源数据经过真实字段读取权限投影，未读到的字段不能覆盖目标；共享字段、虚拟字段和 Join 不复制。完整流程复用现有 prepare/save/revision/assets/retention，不引入另一套内容存储或直接 SQL 内容写入。

仅填空值保留已有字符串（含空字符串）、0、false；null、缺省与空的本地化数组/blocks 可从源复制。本地化 group 递归处理，已有本地化数组按位置填补同类型目标行的空字段；非本地化数组按共享稳定行 ID 只复制其本地化子字段。覆盖只替换源中可读且有值的本地化字段。本地化数组及 blocks 整体复制时重建其结构行 UUID，JSON 内任意 id 不被改写。

媒体复制记录目标稳定字段路径到源修订路径的受信任映射。绑定取源当前修订的具体文件清单，不用当前媒体文档的新文件替代；新的结构行 UUID 通过路径映射继承正确媒体。若源路径映射、媒体身份或源绑定缺失，明确失败。未复制的目标字段继续保留原绑定；映射不作为客户端参数开放。

管理界面在已保存文档提供复制语言入口，选择目标与覆盖策略。当前表单有未保存更改或占用冲突时不可执行；提交期间阻止其他编辑写入并可清理取消。成功后导航目标语言，失败保留真实错误；不确定结果只用原幂等键核实，CAS 冲突须刷新。

无需新增 SQL 结构。注册操作后沿现有 endpoint bindings 配置授权；回滚先停写并切回配套应用，已提交修订和审计保留。观测 localeCopied 修订、forbidden/version_conflict/document_locked、媒体源绑定缺失和请求取消。验证覆盖空值/覆盖、嵌套字段/行身份、双语言权限、CAS/租约/幂等、无回退读取、固定媒体修订、真实 HTTP/UI 和开发生产浏览器。
