# Collections UI 接口补面验证

状态：已核销，2026-10-26。范围按[设计](collections-ui-api-design.md)、[施工图](collections-ui-api-implementation.md)和[测试矩阵](collections-ui-api-units.md)。本增量基于 main 55ec362，仅交付后端分支，不自行合并主分支或部署。

## 1. 实际交付

| 操作 | HTTP | 契约归属 |
| --- | --- | --- |
| collections.editor | GET /v1/collections/:collection/editor | content/editor/contracts.ts、input.ts |
| content.listJobs | GET /v1/collections/:collection/jobs | content/jobs/contracts.ts、content/input-schemas.ts |
| assets.listUploads | GET /v1/collections/:collection/uploads | content/jobs/contracts.ts、assets/input-schemas.ts |
| assets.listCleanup | GET /v1/asset-cleanups | assets/management/contracts.ts、assets/input-schemas.ts |
| assets.getCleanup | GET /v1/asset-cleanups/:id | 同上 |
| assets.retryCleanup | POST /v1/asset-cleanups/:id/retries | 同上；必需幂等键，JSON {}，202回执 |

现有69操作保留，总计75。原上传详情增加filename/declaredMimeType/declaredBytes/createdAt，内容任务详情增加kind及documentId/expectedRevision/requestedVersionId。assetsInputSchemas改为接收部署策略的工厂，所有调用同步迁移。ContentOptions新增实际图片预算及资产发现能力，运行装配与测试装置均已迁移。无新依赖，package.json、bun.lock和测试入口未改。

## 2. 验收核对

- [x] 编辑布局覆盖现有字段及容器，隐藏字段和容器默认值递归投影；读/写/query分别计算，候选schema与PATCH输入明确区分。
- [x] copy/create、历史恢复、发布计划的动作提示包含真实前置权限；复杂关系谓词按原动作上下文求值，候选值策略保持conditional。
- [x] jobs/uploads授权资格、投影状态和过滤先于分页，rows/total同SQL快照；列表自身Where、来源/结果、actor及历史绑定均参与资格。
- [x] process替换会话按真实用途/绑定修订授权；content.getJob资产fallback显式参与原事务，既有授权与新Where均生效。
- [x] 清理查询严格活动超管；重试、审计和幂等原子提交，撤权重放失败；202不表示已删除。
- [x] cleanup_generation随领取/重试递增，迟到成功/失败回写匹配代次，保留有效租约及引用/保留/在途写保护。
- [x] OpenAPI覆盖75操作，新DTO来自公开schema或精确摘要映射，递归本地引用改写为有效组件引用，HTTP回包核对必填字段及日期。
- [x] 0011追加列与索引，不修改历史迁移；Drizzle声明保持ALTER追加的物理顺序，既有完整表列/外键断言保留。
- [x] 预算保持单页100、SQL200、响应2MiB及现有超时；Where深度/节点/值预算先于序列化，关系资格惰性且缓存。
- [x] 四门及三组共六条Bun/Node网络旅程完整复验。
- [x] 独立根装配审查和最终假绿抽查核销。

## 3. 最终执行结果

lint、typecheck、build均已通过：类型感知Oxlint零错误零警告，395个lint文件、388个类型检查文件。Vitest真实PostgreSQL及单元测试97文件、891用例全部通过。Istanbul全仓实际覆盖率为statements92.18%、branches86.52%、functions96.55%、lines95.57%；配置全局门槛90/85/90/90及独立插件门槛均通过，未修改匹配范围或阈值。

完整网络首轮4通过、2失败：扩展计划发现断言后等待计划5秒，既有25ms轮询触发真实120次/分钟限流。仅将公共测试helper轮询间隔改为250ms，生产限流、10秒完成上限与业务终态断言保留；定向Bun/Node两条及最终完整三文件六条全部通过。最终四门日志为/tmp/ui-api-final-{lint,typecheck,build,test}.log。

## 4. 对抗与缺陷证据

方案独立审查落实五项修订：隐藏容器默认值、顶层Where及读写上下文、清理新旧协议排空、read模式/fallback、候选schema与PATCH区别。E/J/A在隔离工作树实现；资产由E、发现由A、editor由J交叉独立审查，均无剩余阻断，实现者未自审自己的实现。

独立根装配审查核对relation scopes及resolver依赖、GET fence、共享图片预算、75操作/factory/handlers/OpenAPI、同事务资产授权、追加迁移/声明顺序及六条旅程业务断言，无剩余阻断。假绿抽查确认没有新增skip/only/todo、弱化有效断言、改变覆盖范围或降低阈值；仅迁移列顺序回归重命名用例、轮询频率调整以及真实新增契约断言。

开发时保留缺陷前失败证据，修复后通过公开业务接口及真实PG验证：编辑query/创建策略/动作前置权限；关系谓词在编辑与真实读取/保存间不一致；process替换误判创建、已消费会话撤权后泄露；清理旧代次覆盖重试账本、缺列/迁移时错误就绪；列表自身Where、资产详情Where、extension Where、只读fence、页溢出与循环/过深策略；资产fallback丢失调用事务；迁移追加列与Drizzle顺序不一致。日志为开发机/tmp/ui-editor-*-before.log、/tmp/ui-assets-*-before.log、/tmp/ui-j-*-before.log、/tmp/ui-api-relation-context-before.log、/tmp/ui-api-schema-order-before.log，对应修复后执行日志同目录保留。日志非产品依赖，正式回归用例已入仓。

## 5. 交接及发布边界

共享差异为README、modules-and-contracts、code-organization，原测试fixture及两组既有e2e；不覆盖前端、Next typegen或协调方私有临时存储适配。原生产存储选择保留：未配置S3时使用本地私有存储，多实例须共享持久化卷。

升级执行0011和操作目录reconcile，三个新collection操作需显式绑定；security清理操作不可绑定。清理协议不能混跑，先停止排空所有旧API/CLI清理，再启用新版；回滚先排空新版，保留扩展列及索引。这里只验证代码和真实进程接缝，未部署、未进行容量压测、真实云账号或多故障域切换演练。
