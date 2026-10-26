# Library 测试数据库迁移范围

本次只调整公共测试装置，不改变生产迁移器、版本化SQL、应用配置、超时、覆盖率阈值或既有业务断言。默认装置仍完整应用生产迁移链。

`createTestDatabase`增加显式`migrationScope: 'full' | 'library'`，缺省为full。既有migrationDirectory仍指定迁移来源。library从来源目录识别相邻的生成plan.json，验证其物理计划后排除该生成应用原生SQL；当前排除0003_collections与0015_oneaster_content。通用身份、授权、审计、内容、资源、任务、本地化和0016预览表继续迁移。过滤后的SQL按原字节复制为一次性只读测试目录，复用生产migrate的directory输入；装置关闭或准备失败均删除目录并关闭连接。每个fixture独立schema，不共享可变数据库或迁移记录。

显式采用library的调用者仅包括：

| 装置 | 所需结构与真实自建步骤 |
|---|---|
| identity/__test__/support | 身份、会话、角色、审计与平台基础表 |
| access/__test__/support、initial-permissions | 基础授权目录、账户、绑定与审计 |
| assets/__test__/support | 基础文件/上传/授权表，注入受控content授权能力 |
| test/support/content-runtime | fixtureStorage构造自有registry，generateArtifacts后执行其SQL，再装配业务API |
| content/adapters/postgres内storage、locale-adversarial、blocks-adversarial、schema-evolution、read-projection-support | 均先generateArtifacts并执行各自定义的原生SQL，存储mapping来自该同一产物 |
| content内schema-migrator、schema-defaults-adversarial、schema-publication-adversarial | 先执行自有旧registry产物，再执行被测schema演进SQL；不依赖部署集合 |

HTTP、createRuntime、跨进程、runtime-role、应用配置、完整迁移升级/幂等、Drizzle映射与database codegen测试保持full。生成物与应用生产迁移链不作任何过滤或修改。

验收先证明新scope在原装置会错误创建部署集合表而失败；默认full必须保留所有迁移记录及最新应用物理计划表。library必须没有应用原生表、仍有本地化和预览表，自建content fixture的实际原生表集合应等于其mapping并能创建、发布和读取文档。另验证只读目录按字节保留基础SQL、清理可重复，以及迁移失败后随机schema、数据库后端连接和临时目录均释放。使用独立UTF8 PG17、max_locks_per_transaction1024，不接触运行世界或其他测试PG。目标模块检查通过后交根任务跑完整四门，装置局部回归不能替代完整失败门的重跑。

高DDL完整套件还需要专用测试PG的WAL与checkpoint预算：max_wal_size4GB、checkpoint_timeout30min，保留fsync/full_page_writes/synchronous_commit均on；磁盘必须能容纳实际WAL与数据增长。默认WAL/检查点配置下曾出现WAL触发的checkpoint，在一次完整运行同步97571文件、耗时32.985秒，同轮完整DDL、单版本SELECT、创建迁移表及审计INSERT出现成对同毫秒的5秒statement超时。这些是资源压力证据；日志没有历史等待图，不能据此断言所有超时都直接由该checkpoint造成。该配置只改变隔离测试数据库的容量/后台调度，不放宽业务SQL、锁或测试deadline，也不关闭持久性；CI在开始前配置、重启并验证实际值。测试库停止时正常完成flush；真实运行与灾备仍按OPERATIONS及实际负载配置。
