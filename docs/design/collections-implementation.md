# Collections 施工图

状态：已核销，2026-10-26；依赖 collections-design.md。实际全量结果及审查处置见 [验收记录](collections-verification.md)。

## 1. 实施顺序

1. 设计审查及测试口径。审阅存量接口、架构检查、真实数据库装置和本地 Payload；确认范围后定稿。
2. 最小正式切片：严格集合/字段定义、确定性物理计划、离线生成、迁移、就绪校验、文章草稿/发布/读取/并发 revision、审计与授权；四门和独立审查验证流程。
3. 完整字段/组合/locale/关系/富文本及安全元数据、类型/数据 schema，查询/索引/权限、schema 演进及历史解码。
4. 完整文档/版本/回收站/复制/清除/裁剪、关系删除策略；模式矩阵与并发测试。
5. 持久化批量/计划/扩展工作、跨实例领取及恢复、Bun/Node 全链旅程。
6. 全契约及操作目录对账、四门、独立对抗审查与假绿抽查，逐项核销并提交/push。本次最新 AGENTS 授权优先于旧文档“暂不 push”的历史说明；不执行部署。

每批使用同一正式引擎，不建立临时 JSONB 引擎。完成切片后继续实施，不把切片当整个功能交付。

## 2. 归属与装置适配

content/collections 与 fields 拥有定义和纯规则；queries 拥有 AST；adapters/postgres 拥有编译/SQL；documents/versions/jobs 拥有用例。database 新增 schema-plan、codegen、content schema 和生成清单精确出口；应用 config/collections、生成命令及 HTTP 只装配所属能力。

扩展既有 schema owner / DAG / HTTP 禁止生成能力检查及违规样本。共享测试数据定义和装配放 test/support，不跨 __test__。真实 PG 按现有 createTestDatabase 隔离 schema/销毁；生成测试使用临时目录、不依赖已生成模块。跨进程复用 process、node-runtime 及真实服务，不新造平行测试框架。

## 3. 迁移、观测与回滚

新增内容表不改身份表；全新检出可离线生成。迁移命令显式运行，ready 拒绝缺表/不兼容计划。首批回滚 API 产物，保留新增表；删除表需确认不存在使用者/保留数据。结构演进必须显式报告扩展/回填/验证/兼容窗口/排空/删除，并以真实数据验证；不自动执行破坏性更改。

观测任务状态、领取代次、过期重领、失败原因、查询预算错误和 schema ready 错误，不写正文或凭据到日志。部署高可用与真实故障切换验收由后续发布阶段负责，不能以本地测试代替。

## 4. 核销记录

方案已独立审查，确认并修复任务副作用 fencing、下载文档/字段权限、裸清单绑定、发布视图唯一性和幂等重放投影五项缺口。每批记录四门、测试数、statements/branches/functions/lines、适用门禁、审查问题处置及未执行项；仅真实执行后填写。
