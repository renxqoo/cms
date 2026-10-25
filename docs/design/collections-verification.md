# Collections 与资产后端验收记录

状态：已核销，2026-10-26。验收范围为完整后端；前端和部署另行实施。参考本地 Payload 固定提交 aebbf75b93e218be4b53a3c7922e0bc82924830b，未复制其代码。

## 能力核销

| 状态 | 能力 | 主要验证入口 |
| --- | --- | --- |
| 已核销 | 严格集合定义、稳定身份、所有基础/组合字段、版本化富文本节点、字段策略、locale 与默认值 | content/collections、fields 的 __test__ |
| 已核销 | 确定性 SQL/Drizzle/类型/数据 schema、无服务离线生成、漂移拒绝、不可覆盖迁移、故障恢复及人工 SQL 审查记录 | commands/__test__/content-artifacts*.test.ts |
| 已核销 | schemaVersion 独立投影、原始历史保留、准备态、分页/尾回填、原子激活及旧 writer fencing | content/adapters/postgres/__test__/schema-evolution.test.ts、content/__test__/schema-*.test.ts |
| 已核销 | typed SQL 查询/索引/搜索、current/published 唯一保留、多态/blocks 全分支、目标语言与权限、实际编译预算 | content/adapters/postgres/__test__、queries/__test__ |
| 已核销 | direct/history/drafts 模式、原子多语言写、复制、发布/取消、历史恢复/diff、回收站/purge/保留 | content/__test__/documents、lifecycle、locale-writes、authorization |
| 已核销 | 文件夹防环/深度、资源跨集合分页、引用查询、安全 metadata、统一内容/资产 job 查询 | content/__test__/folders-and-relations、resources、configuration |
| 已核销 | 持久化批量/计划/扩展、即时领取、逐项续租、当前主体重新授权、失败/部分成功及重启恢复 | content/jobs/__test__/fencing.test.ts、content/__test__/jobs.test.ts |
| 已核销 | 私有上传、配额、真实字节/MIME/摘要、图片处理、不可变清单与固定历史绑定 | assets/__test__、adapters/images/__test__、content/__test__/media-authorization.test.ts |
| 已核销 | 本地及 S3 存储、期限/取消/关闭、候选账本、共享对象保留、失败删除显式恢复 | adapters/storage/__test__、assets/__test__/recovery.test.ts |
| 已核销 | 69 个实际操作、范围授权、HTTP/OpenAPI、流式 GET/HEAD/上传及源字段/媒体下载权限 | http/__test__ |
| 已核销 | Bun 与 Node 真实进程、PostgreSQL、SMTP、媒体上传/替换/历史下载/处理/重启、撤权及 revision 竞争 | e2e/user-rbac.spec.ts、collections.spec.ts、assets.spec.ts |

路径以 apps/api/src、packages/cms/src 及 e2e 对应归属为准；公共装置位于 test/support。没有业务 mock 数据、占位驱动或空导出。

## 最终主线四门

| 检查 | 实际结果 |
| --- | --- |
| bun run lint | 0 错误、0 警告；包含 content:check、架构/DAG/owner 规则、类型感知检查和格式检查，342 个匹配文件格式通过 |
| bun run typecheck | 335 个文件，无类型错误 |
| bun run build | Node API、离线命令、SQL/快照产物及规范插件构建成功 |
| bun run test | 77 个单元/模块集成测试文件、651 个用例通过；随后 3 个网络旅程文件、6 个 Bun/Node 用例通过 |

Vitest 当前全仓匹配范围实际覆盖率：statements **91.86%**（7171/7806），branches **85.62%**（4630/5407），functions **96.24%**（1947/2023），lines **95.26%**（6442/6762）。配置的全局 90/85/90/90 门槛通过；插件的独立门槛也通过。未修改覆盖率 include/exclude 或阈值，未把子 agent 的局部数字当成全仓结果。

S3 本地回退遵循最新用户裁决，production 未配置 S3 时使用本地，显式 local 不校验未使用的 S3 字段；配置相关 8 个定向用例通过。

命令生成另以真实 Node v26.9.0 验证人工 SQL 的拒绝、显式生成、删除原审查文件后的 sidecar 重放及拒绝覆盖；没有执行人工 DDL。生成物按既有生成文件约定排除手工格式化，由 lint/build 中的 content:check 逐字核对。

## 独立审查与回归处置

设计在实施前独立审查；代码由不同实现者交叉审阅。以下已取得缺陷存在时失败及修复后通过的证据，正式测试保留：

- 任务旧代次副作用、批量提前领取消耗租约、逐项总耗时超过单次租约；改为同事务 fencing、即时领取及活租续租。
- 查询与详情的多跳 locale/策略不一致，blocks 同名字段的存在判断、权限覆盖和关系分支遗漏；统一上下文与正向/资格域聚合。
- 未知及合法循环关系路径放大编译量；结构预检和实际 SQL/目标策略共享有界预算。
- 满历史保留上限后不能保存、历史引用窗口遮住活动 restrict、多值关系解除丢失 collection；使用专用保留查询、SQL 活动引用窗口及按字段形状补丁。
- 隐藏 group/row 后代被省略删除、共享传播语言写权遗漏、绑定实际语言下载绕过；统一合并、删除授权及实际来源语言重新授权。
- constructor/toString 继承属性被误当语言值、字段值或已注册 handler；读取 own-property。
- 同类型迁移覆盖旧值/遗漏新索引、旧维护进程清空新准备态；独立版本投影及状态匹配检查。
- 已回填草稿后来被旧实例发布、不同历史页刷文档标记漏掉当前发布资格；在文档标记提交前重验真实生效指针。
- 迁移默认共享数组按语言生成不同 UUID、媒体 JSON 转换产生无来源文件引用；共用 locale 规范化及原始媒体引用校验。
- 生成失败先推进快照导致重试不可恢复；sidecar、SQL、派生文件、活动快照依次原子发布，迁移使用独占发布。
- 上传/内容锁反转、损坏图片仅元数据通过、取消后的 Sharp 事件/资源清理、流取消过早释放请求槽；锁序、完整解码及生命周期回归。
- 本地路径替换读取外部测试字节、S3 删除不回复、迟到写及失败恢复；可信目录/描述符复查、提供方期限和持久化删除账本。

独立假绿抽查确认没有新增 skip/only/todo、覆盖率忽略或弱化有效断言。操作数量由34改为69、重复迁移断言按真实迁移链更新，以及 schemaVersion 物理隔离的旧表保留断言均有明确契约依据；SMTP 令牌解析只移动到公共测试装置。

## 发布边界

没有部署、连接真实云账号、执行容量压测、多故障域故障切换或 PITR 恢复演练。存储遵循用户裁决：S3 未配置时使用本地驱动，production 同样适用；本地多实例须共用持久化共享卷并满足可信目录权限，完整 S3 配置自动选用私有对象存储。生产数据库仍验证 TLS。基础设施 SLA、RTO/RPO 和滚动发布容量是发布验收目标，不能由本地门禁外推。
