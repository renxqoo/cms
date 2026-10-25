# Collections UI 接口补面施工图

状态：已核销，2026-10-26。依赖 collections-ui-api-design.md；契约已先经独立审查，按三个隔离工作树实施并汇总验证，记录见[验证记录](collections-ui-api-verification.md)。

1. 主线拥有文档、HTTP/输入/操作注册与 OpenAPI、公共导出/装配、共享测试装置、0011_ui_api.sql 和跨进程旅程。保留原工作树/主会话在途变更。
2. E 独立 worktree：content/editor/contracts.ts、editor/api.ts、editor/layout.ts 和就近测试；如有内聚必要可按职责细分。消费已有字段结构和 schema生成，不新建表单引擎。
3. J 独立 worktree：content/jobs/contracts.ts、listing.ts、uploads-listing.ts、授权资格/SQL查询适配器及其测试；与 A 对齐公开资产relation端口，不跨模块直读。保留旧 getJob 的逐项行为。
4. A 独立 worktree：assets management、cleanup查询/重试、公开资产jobs/uploads/fileBindings relation、会话详情声明字段和process job授权修复、cleanup generation协议和asset schema及就近测试。assetsInputSchemas 统一改为接收页预算的工厂，完整迁移已有调用，不保留别名/双轨接口。数据库迁移正文先报告主线汇总。
5. 三个模块在独立审查后的定稿契约上并行；主线先集成 cleanup切片（迁移、业务、HTTP、真实 PG 与幂等/并发）验证新增协议，再收拢编辑及列表接口。主线逐步集成，不复制无关依赖镜像。
6. 完成后共同核对所有75个真实操作、DTO/OpenAPI、目录、HEAD/流、精确角色权限、Bun/Node 网络旅程；四门含完整覆盖率，独立对抗与假绿抽查后提交/push，禁止自行合并 main。

共享变更清单预期：content/assets public exports、composition/types/input schemas/operations；API bootstrap/content-policy、HTTP handlers/OpenAPI；database schema/assets与新迁移；公共 fixtures 与 e2e；设计文档。无新第三方依赖，package.json/lock原则不改，完整旅程追加到现有三个API旅程中。
