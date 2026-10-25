# 后台账户/RBAC审查问题修复

状态：本轮已核销，开始于2026-10-25。按用户要求逐项核实、TDD修复，完成后向指定会话请求复查。所有实现以当前代码及实际红测为证据；原方案与本文件共同作为目标，不沿用已证实的缺陷。

## 范围与实施

1. 存活探针：精确GET/HEAD /livez保留Host/Origin/报文边界、安全响应头和requestId，独立于数据库限流及业务并发准入；/readyz继续验证数据库及目录依赖。其他路径和方法不得绕过业务限流。
2. 测试数据库：全部真实数据库装置及连接失败用例尊重CMS_TEST_DATABASE_URL，在配置TCP连接时验证实际传输一致，不以本机Unix socket代替CI连接。
3. 审计：追加新迁移拦截TRUNCATE，禁止改写已应用0001 checksum。运行账号与迁移owner分离；生产启动拒绝高权限/owner或能变更审计的账号，提供明确最小权限授予入口与运行步骤。受信任迁移owner不属于防恶意管理员威胁边界。
4. 账户契约：displayName由identity定义一份约束，access/OpenAPI及创建、更新、自身资料使用同源字段；空串拒绝，null清除规则保留。
5. 角色列表：账户数与权限数以批量聚合获取，随页面行数增加查询预算保持常数；防止两个一对多关联交叉倍增，分页与总数契约保持。
6. 架构门禁：按已约定完整模块DAG及适配器不反向HTTP建立真实CLI合法/违规样本；解析目标及别名绕过均覆盖。纯platform/contracts保留HTTP契约例外，不声称静态证明raw SQL所有权。
7. 访问日志：记录requestId、真实operationId、规范化路由模板、method/status/durationMs、直接连接来源及认证后的actorId；匿名/未匹配字段为null，不记录原始查询、参数值、令牌、密码或邮箱。

HTTP只消费注入业务API及纯契约。RequestContext新增可选的同步认证观察回调，只由identity验证账户/会话或密码后报告adminId；HTTP回调写入本请求日志上下文，客户端字段不进入可信Actor。授权拒绝保留已认证身份，失效会话不得标为认证；登录在锁内最终凭据复核后报告，重复/过期注销不宣称认证。该回调不参与鉴权，也不包含会话或业务数据。

本轮不新增前端、内容引擎、自动部署或固定账号/密码。共享manifest、配置与文档由主工作区统一整合，数据库、access和架构修复在独立worktree开发；不修改其他会话在途文件。

## TDD与验收

每项先保留缺陷状态下失败：实际Hono故障注入与日志捕获、真实PG TRUNCATE/角色权限与TCP传输、字段schema与OpenAPI一致性、真实分页聚合和查询预算、真实Oxlint CLI绕过样本。修复后执行局部回归，再运行lint/typecheck/build/test及Bun/Node旅程，不缩小覆盖范围、不降阈值或跳过有效用例。

记录实际用例数、四项覆盖率、独立审查结果及未执行项。仅提交本轮点名文件，本地提交后按用户指令向指定会话发出复查请求；此前不push的裁决保留。数据库角色及迁移只在隔离测试环境验证，本机真实账户及凭据不变。


## 账号、迁移与日志落地契约

配置新增mode及loadMigrationDatabaseConfig：生产迁移连接CMS_MIGRATION_DATABASE_URL必填，开发/测试可回退DATABASE_URL；API不读取迁移凭据执行请求。CMS_DATABASE_RUNTIME_ROLE仅供db:grant-runtime给现有专用LOGIN角色配置权限，不创建或输出密码。db:migrate和operations:reconcile使用owner连接；API、维护及admin:initialize使用运行连接，生产启动/就绪和初始化执行assertRuntimePrivileges。业务/台账schema精确表清单与新模块同变，不向未知表自动授予权限。

运行账号仅获必要数据库CONNECT、schema USAGE、业务表CRUD；审计仅SELECT/INSERT，操作目录与迁移台账仅SELECT，不得拥有对象、成员身份、CREATE能力或额外表/列/GRANT权限。禁止其可执行的SECURITY DEFINER及CMS可写表上的启用definer触发器；guard启用与完整事件集合必须核对。既有PUBLIC遗留权限不可通过本角色REVOKE消除时事务失败，由DBA处理。保留PUBLIC TEMP，search_path明确为业务schema,pg_temp。schema、数据库及角色owner属于可信运维，校验不证明任意受信任owner编写SQL的语义安全。

只读取Hono已匹配路由，不再独立匹配URL。日志按实际响应routeIndex归属；尚处于入口准入时使用首个已匹配具体路由模板，未知路由为null。回调只报告可信adminId，不把客户端x-actor-id、token或正文当Actor。静态/参数同URL两种注册顺序、错误登录、授权拒绝、重复失效注销、限流失败及敏感信息缺失均有公开协议回归。

权限装置需要验证数据库级PUBLIC函数/权限面，采用每fixture随机专用数据库、schema和角色；普通业务装置继续schema隔离。创建归属标记防止异常清理删除未由本fixture创建的资源。Bun/Node旅程真实执行迁移→目录发布→运行权限授予，再用受限账号初始化、邀请、鉴权、撤权和退出，并在依赖故障时验证livez200/readyz503。测试环境显式设置迁移连接，不能继承部署凭据。


## 核销结果

| 用户发现 | 修前证据 | 修复后验收 |
| --- | --- | --- |
| 存活依赖限流库 | 实际Hono删除隔离限流表后GET /livez由200变503 | 精确GET/HEAD仍200；ready与业务503；其他方法/路径不绕过；Bun/Node真实网络旅程同验 |
| CI测试写死Unix socket | 配置TCP control地址与原被测Unix地址null不同，断言失败 | idle失败恢复两连接同取配置，实际TCP全量门禁通过 |
| 审计可TRUNCATE与owner运行 | 真实TRUNCATE成功清空；旧ALL授权允许CREATE及审计变更 | 新0002保护U/D/T；最小权限、CONNECT、owner/member/definer/额外列权/guard缺失均实测；owner生产ready修前错误放行、修后拒绝 |
| displayName契约漂移 | 三公开schema接受空串，实际业务拒绝；初始化错误类别也漂移 | 同源identity字段，空/65字符拒绝、1/64/null合法；公开JSON Schema与实际写入一致 |
| 角色列表N+1 | 返回1→8角色，实际查询8→15，并出现同客户端并发查询警告 | 查询预算保持常数、单事务串行；零关联/归档引用/3×3独立计数/分页均通过 |
| 依赖规则不足 | 19条规则/真实CLI原本漏报，含audit→access、adapter→HTTP与别名 | 规则与CLI目标组100项绿；完整已约定DAG、实际解析目标与合法出口均验证 |
| 访问日志不足 | 公开请求日志缺字段；修复过程中发现静态/参数重叠路径归属反写 | 请求相关字段、可信Actor、敏感信息缺失、两种路由顺序、早期503日志5项绿 |

独立交叉审查关闭业务契约、架构、HTTP和数据库既有发现。审查暴露的临时表遮蔽、definer直接/默认表达式/触发器可达性、缺失/禁用审计guard、PUBLIC函数导致测试间干扰和CONNECT遗漏均先红后绿；保护不依赖猜测SQL函数源码。测试清理后随机测试角色与数据库各0，无残留。

最终实际四门：lint零错误零警告、bun check、Node API/五个入口构建通过；test为33文件346项全过，随后Bun/真实Node的2项受限账号网络旅程通过。Istanbul全局S/B/F/L90.60%（1929/2129）、87.86%（1043/1187）、95.10%（564/593）、92.60%（1729/1867），90/85/90/90门槛通过；原tooling专属范围96.51/92.02/100/97.94同样达标。范围仍覆盖全部本期手写CMS/API/database及原插件，未排除CLI、SQL适配器或修改阈值；不外推未实现内容/UI。

本机仅对已核实的development、本地/tmp连接、new_cms数据库应用新增迁移，命令成功；没有改真实账户、密码或运行连接。生产强制使用专用受限账号；本地开发/test owner例外及部署步骤见README。未push、未触发远程CI或部署。提交后按用户指令将本轮证据和提交发给指定会话进行只读复查。
