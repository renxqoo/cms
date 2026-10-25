# RBAC 恢复读取施工与验证

状态：定稿，2026-10-26。级别：中。实施基于1477c28，遵循已独立审查的[接口契约](rbac-recovery-read-contract.md)。协调方已授权实际实现；独立分支提交并push，由前端主会话统一集成，不自行合main。

## 1. 受影响面及所有权

新增一个global security操作access.readRecovery，GET /v1/security/recovery，三个resource判别分页，正式输出schema及类型位于access/recovery/contracts.ts，输入工厂recoveryInputSchema(policy)位于access/recovery/input.ts。createRecoveryApi(runtime)提供readRecovery(ctx,input)，接入现有AccessApi。AccessOptions新增必需recoveryMaxResponseBytes，由应用contentLimits().maxResponseBytes注入，不在业务层给缺省值。所有createAccess调用及测试装置同步迁移。

不新增表、索引、迁移、后台工作或计时器。普通permission操作保持原授权及错误语义。前端、依赖锁、覆盖率范围和门槛不改；新旅程纳入既有e2e/user-rbac.spec.ts入口，不修改package.json脚本。

根工作树拥有composition/types/operations/input-schemas/public exports、应用bootstrap及共享fixture、真实Bun/Node旅程与文档。J在独立工作树拥有access/recovery/**（含业务及就近测试），不提交依赖镜像；E在另一独立工作树拥有HTTP专用恢复query解析、协议接线、OpenAPI及HTTP测试。根集成后由独立审查者检查diff、契约和假绿，业务实现者不自审。

## 2. 实施顺序及一致性

先记录普通GET因绑定/权限失效而拒绝、恢复端点尚不存在的网络边界；以公开HTTP和业务接口断言目标，新增功能缺失不得用类型失败代替行为失败。然后实现共享安全锁中的当前super验证、严格判别输入、有界SQL及安全DTO，最后集成HTTP/OpenAPI和跨进程闭环。

持久化bindings/permissions在数据库内过滤/count/page，不调用allResources；rows/total使用同一SQL快照。catalog来源仅真实operationMap和受信任collectionKeys，按固定排序计算总数并截取有限页，再批量关联本页绑定，不能载入全部历史绑定或逐行查询。参数绑定覆盖所有外部筛选，removed scope只允许读取，不扩大既有写授权。

新恢复HTTP解析仅该operation使用，保留普通routeInput行为。query数字仅接受单个规范正安全整数；重复参数、未知/不适用字段、scope组合及偏移溢出统一invalid_input并给fieldErrors。query scope始终是资源筛选，授权始终global。序列化结果超过装配字节预算返回409 capacity_exceeded。GET不修改RBAC业务数据、审计或幂等记录，保留既有IP/用户限流写入。

## 3. 测试口径

| 层 | 必须验证的行为 |
| --- | --- |
| 业务/真实PG | 三resource的精确筛选、固定排序、默认页/末页total、disabled权限及孤儿绑定、移除配置的collection范围；SQL数量不随历史条数或页行数放大 |
| 授权/并发 | 活动普通角色403、账户/会话失效401、当前super重新校验、安全锁下撤权顺序、取消和超时；无法给新security操作创建permission绑定 |
| 输入/输出 | 无resource及未知判别、UUID/页/偏移/scope垃圾、跨resource筛选、严格输出无凭据或额外字段；注入字节预算及非法预算配置 |
| 恢复闭环 | 删除endpoints.list自身绑定后普通GET403，恢复读找到未绑定目录并通过既有POST重建；禁用permissions.list权限后恢复读取得真实CAS并启用，旧CAS409，重新读取后恢复普通GET |
| 引用保护 | 有引用的权限删除仍409；先解除binding/role/navigation引用再删除，经恢复视图重建permission/binding；不放宽FK或scope检查 |
| HTTP/OpenAPI | 76真实操作；GET/HEAD、private/no-store、无body/无幂等键要求；重复/非法query的fieldErrors；公开判别DTO与served schema一致，恢复不依赖已损坏OpenAPI访问 |
| 网络 | 既有user-rbac入口增加Bun/Node真实恢复旅程：删绑定/禁用及删除读取权限、刷新发现、CAS冲突和修复后普通读恢复；真实数据库/会话/限流，不绕过安全检查 |

保持既有90/85/90/90及插件门槛；四门按package.json真实脚本执行。此分支仅后端，因此build实际为Node API及命令，test为Vitest覆盖率及现有Bun/Node旅程；不宣称执行该分支不存在的Next/browser脚本。

## 4. 收口记录

完成后填入真实四门用例数、覆盖率、独立审查处置和共享差异。契约与本文同步推进已实施/已核销，README及全局目录更新为76操作。无数据兼容窗口或双轨路径，回滚停用本新增读取产物即可，已通过现有写端点进行的修复仍按原审计/CAS语义持久化。
