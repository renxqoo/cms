# OneAster 内容系统施工与验收

状态：已实施，正在执行最终跨仓验收与独立复核。关联：[DESIGN](DESIGN.md)、[CONTRACTS](CONTRACTS.md)。

## 1. 起点与隔离

- CMS 基线：ce5e847；工作区 `/Users/wrr/.codex/worktrees/oneaster-content/new-cms`，分支 `codex/oneaster-content`。
- client 基线：6e22beb；工作区 `/Users/wrr/.codex/worktrees/oneaster-content-client/oneaster-client`，分支 `codex/new-cms-content`。
- 开始时 `/Users/wrr/work/new-cms` 有其他任务的 8 项在途修改，不复制、不回滚、不提交；期间该任务提交为ce5e847，原工作区恢复干净。client 原工作区干净。本次实施整合时显式吸收已提交基线，不将其算作本次改动。
- CMS 使用 Bun 1.4.4，client 当前为 Bun 1.4.3；各仓库遵守现有锁定，不顺带升级依赖。修改 Next 代码前读取各安装版本的对应 docs。
- 多 agent 开发各自独立 worktree，按批准的接口合同分工；根代理负责跨仓合同、整合和验证。独立审查 agent 不实现被审代码。

## 2. 只读审计与裁决

| 审计项 | 实现证据 | 裁决 |
| --- | --- | --- |
| C01 集合/编辑器 | apps/api/src/config/collections/index.ts；apps/admin/src/features/collections、features/fields | 扩展真实业务定义，复用表单、历史、发布、权限 |
| C02 发布身份唯一 | packages/cms/src/content/adapters/postgres/unique-reservations.ts；__test__/documents.test.ts | 复用当前草稿和发布联合保留，新增模型/双实例证据 |
| C03 匿名读取缺失 | content/runtime.ts；content/operations.ts | 新增受限公开用例，不伪造超管 |
| C04 事务隔离 | packages/database/src/client.ts 固定 READ COMMITTED | 增加明确只读一致事务能力及异常/取消测试 |
| C05 普通关系可指草稿 | documents/validate-publication.ts；expand-relations.ts | 公开投影只读取已发布目标，不信任编辑侧可见性 |
| C06 公开媒体缺失 | project-assets.ts；assets/references/participants.ts；http/assets-handlers.ts | 复用 revision-bound binding，新增匿名公开资格验证与流读取 |
| C07 缓存基础 | apps/api/src/http/lifecycle.ts 强制 no-store | 仅对已注册公共读取调整缓存、ETag、304、CORS，管理/预览不受影响 |
| F01 全部 CMS 面 | client src/lib/content、i18n/service、modules/{site,home,models,docs} | 删除全部旧源实现，同步装置、门禁、文档 |
| F02 模型 ID | published-model-contract.ts；published/use-published-saved.ts | 公共ID统一UUID；收藏用新key；Core modelId保真 |
| F03 首页视觉 | home/home-page.tsx、published/、animation/、carousel/ | 复用，不调整视觉 |
| F04 资料与试用 | cms-model-page；studio；media-studio | 资料参数编辑保留，真实执行生命周期保留 |
| F05 语言边界 | i18n/language-contract.ts 与 model-content/model-page-types.ts | 统一动态BCP47，保留RTL及同语言界面容灾 |
| F06 全局 snapshot | content-snapshot.server.ts；sitemap扫描；read-published-model-guides.server.ts | 新聚合接口/一致导出替代；不得裸删snapshot后保留漂移扫描 |

旧 CMS 一共 15 个上游路由模板：10 固定 JSON（snapshot、languages、ui-messages、site、home、models、model-paths、model-facets、docs、doc-paths），2 详情，1 模型资料预览，2 资产路径。前端自身 BFF 不重复计数。移除清单覆盖生产代码、测试 upstream、真实服务验收和环境变量。

## 3. 目标归属

- `apps/api/src/config/collections/`：OneAster 内容定义、受控技术配置的装配选择、预算。
- `packages/cms/src/content/delivery/`：公开 DTO、单次聚合投影、查询边界、预览读用例；SQL 仍在 content/adapters/postgres。
- `packages/database/`：只读事务能力、生成结构、唯一迁移链；不导入CMS配置。
- `apps/api/src/http/`：注册新操作、薄协议、ETag/缓存/错误；bootstrap 注入业务能力。
- `apps/admin/src/features/`：模型内容编辑、调用方式/场景预览、消息搜索编辑；复用基础组件。
- client `src/lib/content`：new-cms传输/配置/错误；各modules service消费自己的聚合 DTO；去掉 service/payload 命名与旧路径。
- client `src/modules/models`：新卡片/详情合同与接入组件；`studio/media-studio` 保持真实执行归属。
- 各源码邻近 `__test__`、共享 `test/support`、跨进程 `e2e`；同步架构导出、门禁和用户文档。

## 4. 实施顺序

1. 所有方向确认并完成独立方案审查；冻结新合同、样例和测试预期。
2. 最小垂直切片：开发商和文本模型编辑/发布、匿名目录/详情、client新reader与原文本试用绑定。真实数据库+两进程贯通，四门与独立审查通过后扩大。
3. CMS侧扩全站内容、媒体公开、消息校验、文档blocks及受控配置；client侧并行完成语言/site/home/docs/SEO/收藏/全量切源；模板/试用侧按确认的实际Core能力整合。
4. 在共享契约基础上整合全部调用方；删除旧路径/旧source/旧preview协议和不再使用的解析器。功能仍需存在的旧测试迁移到新合同，不删除有效行为断言。
5. 完成端到端、双实例、取消/故障/恢复、安全矩阵与容量检查；四门、覆盖率、独立对抗审查、假绿抽查后收口。

各阶段为可审阅提交，不能以阶段完成冒充全功能完成。不得在双轨状态下交付。

## 5. 实现前测试口径

### 5.1 新规格

- 单主分类、动态语言、输入输出/能力的同binding组合匹配；默认binding/场景存在，重复key拒绝。
- 技术声明与平台开放范围分别验证；无binding的向量/音频能完整管理展示，defaultBindingKey=null，不能出现真实执行按钮；任务筛选与五大分类分开保留。
- 模型contentLocales只发布完整且选择的翻译；技术key与整模型发布原子切换；新增语言不强制重译所有模型。动态localeSource贯通所有内容操作、历史、唯一性和双实例，禁用不删除历史。
- modelId前后空白/控制字符/超长拒绝；大小写、斜杠和合法符号保真；草稿修改不改变公开key；两个文档/两个实例并发只能一个占用相同key；归档、清除、历史恢复边界。
- 公开范围矩阵：匿名/普通管理员/内容编辑/发布者 × 草稿/已发布/撤下/回收站 × 列表/详情/计数/关系/媒体/预览。无权内容不能通过total、facet、关联标题或媒体泄漏。
- 公开聚合并发发布交错时同一响应来自同一事务视图；只保存草稿不改变公开DTO/ETag；相关记录发布会改变最终ETag。
- 条件GET/HEAD/304、无对应body、跨locale、错误不缓存、CORS、Range、客户端断开、超大/截断/无效UTF8、异常状态和deadline。
- 新执行profile先测失败：music.generate歌词/纯音乐约束、audio.transcribe语言与文件环境输入、H3四型号矩阵；七语言生成物须执行multipart/任务装置验证，供应商账号拒绝和unknown不得报告成功。
- 模板按真实profile/SDK/tool组合覆盖；样例模型key只来自当前记录；JSON/shell/语言字符串正确转义；任务等待有终态和时限；样例不包含真实密钥。
- UI消息缺键/多键/ICU参数或tag不匹配、禁用语言、新BCP47、RTL、翻译缺失、配置不可用。
- 新预览篡改/过期/跨文档/跨语言/超时/退出、token脱敏、无索引、无缓存、无自动执行；metadata和正文使用相同版本。
- 草稿未公开媒体通过grant专用同源代理读取；跨revision/binding拒绝，issuer撤权及时失效；过期清理未执行时也拒绝；管理端撤销/退出撤销后复制凭据无法再读，CMS不可达时不伪报撤销成功。
- 消息合同精确版本协商、滚动窗口/回滚/窗口到期、首次en/zh初始化、重复运行不覆盖编辑、未知语言及明确禁用不被fallback复活。
- sitemap/index慢消费者、流中失败、截断、丢end、摘要错、超额、并发准入、分桶唯一及释放；普通docs导航超100项时完整索引仍可搜索访问。
- 全部新接口真实空结果与上游故障分别返回；无业务mock、无假成功。

### 5.2 必须保留的用户行为

- 首页现有全部视觉/动画/轮播/链接/推荐；桌面、窄屏、RTL。
- 目录搜索、筛选、收藏、分页、返回上下文、前进后退、语言切换。
- 文档块、锚点、代码tab、复制、原文、图片和安全链接。
- 资料参数必填/类型/枚举/范围/step/结构化JSON、场景切换/加载/reset/复制；不伪装真实生成。
- 文本真实试用的认证/Key交集/预算/估算/意图/部分文本/完成/异常/恢复/历史；图片、视频各自参数和任务流程。
- 语言切换不清除会话草稿、在途意图和业务错误；取消和组件卸载清理资源。
- Core认证、充值、Key、用量、账务既有回归保持；CMS故障不能把这些业务数据改成本地内容。

## 6. 装置适配与检查入口

CMS复用 `test/support/content-runtime.ts`、database/runtime-database、cms-process、admin-application-process。client复用 `scripts/start-auth-e2e-server.ts`、content-e2e、studio-e2e、media-studio-e2e；内容源改为新协议。新增跨仓旅程必须连接真实new-cms进程和数据库，不能只让fixture模拟新CMS。

client真实服务suite当前拦截真实生成POST；这类suite不能作为真实供应商付费执行证据。付费推理另走显式opt-in，在具备真实环境和授权时运行。本轮专用Core0.24候选已提供文本、图片、视频、音乐与ASR合同；供应商权限限制与软件执行能力分开报告。

两仓分别执行真实 `bun run lint/typecheck/build/test`；CMS还按受影响文件选择 `bun run test:e2e`，client同样使用自己的test:e2e入口。源码目录重命名同步vitest覆盖率匹配，不能让new-cms reader移出原payload/core的perFile门禁。

每次报告实测用例数与statements/branches/functions/lines。CMS当前全局及指定UI/admin门禁90/85/90/90；client存在按路径/文件局部门禁，不能宣称未配置的全仓门禁通过。未运行或环境阻塞检查明确记录。

## 7. 高可用与验收清单

- [ ] 完整新合同冻结并逐项实现，Core扩展边界已裁决。
- [ ] 原15个CMS上游模板的生产调用及真实验收均替换，旧路径无双读/别名。
- [ ] 全新内容可由管理员录入、保存、发布、预览、撤下、恢复；无占位接口。
- [ ] 模型身份保真、全局唯一、原子发布、匿名安全读取和媒体资格通过。
- [ ] 首页、目录、文档、SEO、语言/消息及全部试用行为逐条保留。
- [ ] 真实CMS+client+数据库跨进程旅程通过，付费执行证据边界真实报告。
- [ ] 两API实例共享事实，单实例停止/重启、客户端断开、数据库不可用/恢复及资源预算通过。
- [ ] 生产构建、启动、就绪、摘流、发布/回滚、运行账号和共享存储手册可执行。
- [ ] 两仓四门通过，测试数与覆盖率实测数字记录，独立审查问题逐条处置。
- [ ] 无新增skip、有效断言未弱化、覆盖率阈值未降低；新测试可证伪错误行为。
- [ ] 仅提交本次明确文件；用户最新裁决：CMS/client先提交、push、合并main后继续验证；Core仅PR、不合main，PR受阻可提交issue；部署单独授权。

## 8. 当前验证记录

最终检查进行中，完整实测结果随后记录。运行与恢复步骤见 [OPERATIONS](OPERATIONS.md)。未执行的检查不计为通过；本地 Node 构建、真实 PostgreSQL 与 S3 协议测试服务的双节点证据不等于线上云存储、数据库灾备或月可用性已达标。

## 9. 独立方案审查处置

| 问题 | 处置位置与规则 |
| --- | --- |
| R01 动态语言未贯通 | DESIGN第7节：原生localeSource，所有读写/历史/唯一性同源解析，新增语言无重建 |
| R02 跨语言key分叉与部分翻译 | DESIGN第3节：整模型原子发布、显式contentLocales、只校验所选完整语言 |
| R03 草稿媒体无通道 | CONTRACTS第5节：持久短期grant、管理端和退出撤销操作、revision-bound媒体读取与client同源代理 |
| R04 展示模型无能力来源 | technicalCapabilities与apiBindings分别表达，无binding与null默认项为合法状态；parameterReference保留无执行器模型的本地参数编辑 |
| R05 消息版本协商遗漏 | interface必填messageContractVersion；精确匹配、当前/前版有界24小时窗口与删除条件 |
| R06 流导出占池/假成功 | CONTRACTS第4节：准入1、总/空闲期限、条数/字节界限、start/item/end摘要及失败协议 |
| R07 文档指南容量空白 | 有界局部导航加完整一致索引，保留独立搜索/分页，不静默截断 |
| R08 空系统初始化 | 显式幂等软件语言/译文初始化，无业务demo，先site后首页/文档/模型的实际发布旅程 |
| R09 任务筛选遗漏 | tasks独立受控词表、参数/facets/URL/history/译文同变 |
| R10 索引许可缺字段 | seo.allowIndex默认true，false统一影响metadata、索引链接和sitemap |

独立审查已复核上述处置，方案层无剩余P1/P2；这不代表实现或测试已经完成。用户已确认整体方案，可以开始实现。

## MiniMax profile 目标验证

隔离engine worktree复制主集成profiles基线后增量实现；新合同先以10个失败测试复现，H3声明约束越界与macOS Bash缺文件错误退出码另有先红后绿回归。profiles六文件63项全部通过，目标覆盖statements99.02%、branches96.27%、functions100%、lines99.44%，满足当前90/85/90/90目标门禁；不代表全仓覆盖率。bun check487文件通过，目标type-aware oxlint零错误/警告、oxfmt及diff检查通过。全仓四门和集成生成物由主集成工作区统一执行。

JavaScript、TypeScript、Python、cURL、Go示例实际启动子进程，对本地假HTTP装置验证单次multipart文件字节/字段、稳定意图、轮询、settled文本、MP3保存、unknown和缺文件/超大文件拒绝。Java17配官方Maven Jackson2.19.4另行编译并运行ASR与音乐两个旅程通过；PHP环境缺执行器，未实测运行，不声明已通过。上述装置不代替真实供应商/Core/client验收。cURL要求8.4以上以使未知Content-Length响应也受max-filesize限制，依据[官方手册](https://curl.se/docs/manpage.html#--max-filesize)。

## Seedance 2.5及大请求示例验证

基于Core523f200主线实际合同，新增video.seedance-25-text；独立先红3项覆盖20480 Unicode边界、四字段拒绝透传、比例/分辨率/时长与旧Lite约束。五语言JS/TS/Python/cURL/Go实际子进程完整发送20480字任务，仅一次POST和一次GET，读取settled URL。Java17最大输入曾实际编译失败constant string too long，分块运行时构造后编译及ASR/音乐/2.5三旅程均通过。cURL采用stdin承载JSON/base64，依据[Linux execve字符串限制](https://man7.org/linux/man-pages/man2/execve.2.html)，以131071字节参数预算装置先红后绿；这是模拟Linux参数限制，不冒充在Linux运行。PHP仍无执行器，未实测。

最终profiles八文件72项通过，目标statements99.13%、branches96.7%、functions100%、lines99.5%，满足90/85/90/90门禁；bun check490文件、目标type-aware oxlint零错误/警告、oxfmt和diff检查通过。全仓门禁和内容生成物仍由主集成工作区收口。
