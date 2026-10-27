# Collections 配置与生命周期

状态：实施中。以 Payload aebbf75b 的集合及字段产品能力为行为参考，保留 Hono、PostgreSQL、独立身份与 RBAC，不执行配置中任意网络脚本。

## 生命周期契约

集合 hooks 为具名阶段的版本化函数数组：beforeOperation、afterOperation、beforeValidate、beforeChange、afterChange、beforePublish、beforeRead、afterRead、beforeDelete、afterDelete、afterError。字段 hooks 为 beforeValidate、beforeChange、afterRead 的值转换以及 afterChange 观察。默认值、校验与 hooks 可返回 Promise；所有调用方统一等待结果，无同步旧入口。函数身份和版本参与 behaviorHash，未知阶段严格拒绝。

上下文包含真实主体、操作、集合、语言、读取模式，以及在适用阶段可见的候选数据、旧数据、字段值与路径。所有数据克隆并递归冻结，回调不能修改共享快照、访问数据库事务、提交事务或替代授权。转换结果再次执行有界 JSON、字段类型、引用与最终写权限校验；afterRead 后基于原始权限数据重新投影可读字段。beforeRead 仅追加 Where，与原权限谓词相交，不替换既有过滤。每次调用计入请求总量预算，单次调用有可配置超时并接收关联请求取消信号；超时或取消回滚事务并释放连接。观察函数等待后须返回 undefined，异常使操作失败。afterError 仅接收脱敏错误码，不替代原错误；外部异步副作用只通过已有持久化 afterCommit 任务执行。

beforeValidate 在补丁规范化前运行，beforeChange 在完整候选生成后运行；afterChange 在修订、引用、审计与提交后任务同一事务内观察最终快照。观察失败回滚全部业务与审计。beforeDelete/afterDelete 覆盖归档和清除，逐项批量沿用相同内部用例；历史恢复及复制同样执行实际写阶段。幂等回放不会重做已提交写阶段，读取投影仍按当前权限计算。

纯发布只运行只读 beforePublish 与字段校验，不重复执行会改变候选值的 beforeValidate/beforeChange/defaultValue。计划任务绑定不可变版本；转换应按 context.operation 配置于 create/update/autosave 等实际写入操作。

## 字段与界面配置

字段默认值、虚拟值、选项标签、条件显示和字段呈现由唯一配置源生成安全编辑元数据；前端不接收可执行函数。集合标题、默认列、描述及已登记组件标识由后端安全投影，字段级隐藏权限继续优先。组件由应用受信任注册表按标识装配，未知标识明确失败，不动态执行远端脚本。

## 迁移与回滚

纯显示与 hook 配置只改变行为摘要，不改物理 schema；影响实际字段持久化的变化必须提高 schemaVersion 并经现有生成、显式转换和回填流程。上线先排空旧 writer，再切换新 API/管理端并验证 behaviorHash、权限、字段投影与动作一致性；没有旧阶段别名或双轨字段。观察 invalid_input、forbidden、任务失败及审计，所有指定旅程与四门通过后切换完成。回滚使用上一个配置和应用产物，若 hook 已改变业务数据则先备份并使用显式逆向迁移或前向修复。

0018 将提交后扩展任务的源语言单独持久化为 content_jobs.source_locale，接受时从真实源操作写入，执行和权限复核只读取此列，handler 接收同一 locale。批量和发布任务仍只以 item.payload.locale 为事实来源。部署必须停止旧 writer 并排空 queued/running 扩展任务；迁移遇到在途旧任务会明确失败，禁止猜测默认语言。旧终态任务保留 NULL，不能恢复执行或按默认语言授权；恢复元数据需要管理员基于原始业务证据显式映射。新增活跃扩展任务缺语言以及其他任务写入 source_locale 均被数据库拒绝。回滚先排空新任务并停止扩展任务接受，再恢复旧产物，保留新增列和审计证据。

## 验证

通过公开配置与内容 API 覆盖阶段顺序的可观察结果、回滚、不可变输入、异步成功/拒绝/超时/取消、最终授权、权限收窄、批量和历史恢复；界面覆盖实时条件、选项标签、只读与自定义组件、标题及默认列。检查保留原覆盖率和全部门禁。
