# RBAC 恢复读取施工与验证

状态：已核销，2026-10-26。级别：中。实施基于1477c28，遵循已独立审查的[接口契约](rbac-recovery-read-contract.md)。协调方已授权实际实现；独立分支提交并push，由前端主会话统一集成，不自行合main。

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

| 检查 | 实际结果 |
| --- | --- |
| bun run lint | 架构/生成产物/类型感知Oxlint/格式通过，零错误零警告；406个格式匹配文件 |
| bun run typecheck | 399文件无类型错误 |
| bun run build | Node API、命令、迁移打包及规范插件通过 |
| bun run test | 101文件、912个单元/真实PG用例全部通过；三文件8条Bun/Node网络旅程全部通过 |
| 全仓Istanbul | statements92.28%、branches86.60%、functions96.61%、lines95.64%；全局90/85/90/90及插件独立门槛通过 |

修复后完整四门日志为/tmp/recovery-final-{lint,types,build,test}.log。先行定向集成15文件69例通过，新增错误放大回归后再跑完整门禁；不把定向或局部覆盖率当作全仓结论。未执行本分支不存在的Next/browser构建或浏览器旅程；实际脚本未修改。

- [x] 当前super资格在共享安全锁后重新验证；query scope仅作过滤，普通permission授权不变。
- [x] 三resource严格分页/筛选/DTO，disabled权限、孤儿绑定和已撤除collection范围可发现；catalog只生成当前页并批量关联绑定，持久化rows/total同SQL快照。
- [x] 必需字节预算在生产及三个共享装置显式注入；UTF-8整页上限、非法预算配置、未知参数线性错误回包均验证。
- [x] GET/HEAD、private/no-store、无幂等键读取及OpenAPI判别参数/必填resource/输出schema一致；普通query错误信封及cache语义保留。
- [x] 真实进程验证普通403、跨重启恢复、旧CAS409、FK引用保护409、修复写与幂等重放、注销401；没有用GET自动写入或reconcile掩盖缺口。
- [x] 独立审查及假绿抽查通过，没有新增skip/only/todo、弱化断言、覆盖范围排除或降低门槛。目录计数34→35、当前超管生效操作30→31及空末页32均有新增security操作依据，并补该操作分类/可见性断言。

## 5. 对抗审查与已修复缺陷

E独立审查J业务8文件，核对实时授权、安全锁、SQL快照、固定排序、目录分页窗口及O(operations+collections+pageSize)内存，没有范围笛卡尔展开或N+1；P独立审查E的HTTP及根装配、DTO/OpenAPI、网络恢复和假绿，无剩余阻断，实现者未审自己的实现。两者均只读，最终结果采用根实际门禁。

已有行为证据：/tmp/recovery-http-missing-before.log在1477c28基线先解绑204、普通GET403，恢复GET实际404；不以新导出缺失导致类型失败充当红证据。/tmp/recovery-j-global-before.log固定global目录的collectionKey曾错误取首个集合，现为null，回归已通过。

对抗核查发现unknown_keys的每条fieldError重复整组Zod键名，500个未知短键的3542字节URL造成2,774,127字节错误信封。新增公开业务回归先失败，修复仅给每键短中性消息；500键为24,127字节、100键为4,927字节，全部逐键fieldErrors、400状态和strict校验保留，验证线性增长。证据为/tmp/recovery-j-unknown-error-before.log及/tmp/recovery-j-unknown-error-metrics-after.log，最终回归入recovery-input.test.ts。

## 6. 精确共享差异及集成

基于1477c28的新codex/rbac-recovery-read分支，无前端、package.json、bun.lock、测试入口或覆盖率配置差异，无数据库迁移。共享文件差异：

- apps/api/src/bootstrap/create-runtime.ts为createAccess注入contentLimits().maxResponseBytes。
- access/__test__/support.ts、assets/__test__/support.ts、test/support/content-runtime.ts同步必需预算；AccessOptions、composition、input-schemas、operations及index按唯一新公开能力接线。
- HTTP handlers/operation-handlers/lifecycle/OpenAPI仅为新操作增加专用解析及描述；普通路由和授权不变。现有http.test.ts操作数75→76，两个Access目录用例计数同步新security操作。
- e2e/user-rbac.spec.ts保留原两条旅程，补非超管/失效会话读取拒绝；增加两条恢复旅程，现有脚本自动覆盖，共8条网络旅程。
- README操作数76并链接契约；modules-and-contracts新增单路由，code-organization明确access/recovery及所属SQL。

部署前仍需通过现有operations:reconcile发布新增真实操作，API不自动迁移、补绑定或恢复权限。没有数据兼容窗口或双轨路径；回滚停用本新增读取产物即可，已通过现有写端点进行的修复仍按原审计/CAS语义持久化。主会话统一集成main；本分支不合main、不部署。
