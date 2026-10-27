# OneAster 内容接口与数据单元

状态：CMS/client代码范围已核销。本文定义当前合同，实测结果与外部限制见[验收记录](VERIFICATION.md)，实施与证据见[施工图](IMPLEMENTATION.md)。

## 1. 模型单元

CMS 原生 envelope 提供 UUID `id`、revision、发布指针、历史和时间；业务字段不再复制这些状态。

| 字段 | 规则 |
| --- | --- |
| modelId | 非本地化 text，管理员填写，发布必填、唯一、最多 200 UTF-8 字节；不自动 trim/改大小写/添加提供商前缀；拒绝前后空白和控制字符，保持合法值原样 |
| slug | 非本地化 text，发布必填、唯一、1–120 个小写字母/数字及分隔连字符；修改时明确提示地址变化 |
| title / summary | 本地化标题与简短介绍，分别最大 256/2000 字符；contentLocales 内每种语言发布必填 |
| contentLocales | 本 revision 对外提供的完整语言集合，至少一种；整模型原子发布，未选择的部分翻译不对外读取 |
| developer | 可选开发商关系；公开时仅展开已发布安全字段 |
| family | 可选系列名称 |
| primaryCategory | 单选 text/image/video/embedding/audio；audio 范围已确认 |
| technicalCapabilities | 模型技术声明的 inputs、outputs、tasks、features，独立于平台执行支持；至少一种输入和输出 |
| parameterReference | 可选资料参数表单与场景预设；八类字段、枚举/范围/步长/默认值及说明；无binding时仍可本地编辑和复制资料JSON，不生成或提交平台执行请求 |
| specifications | 可选文本/图像/视频/向量/音频规格组；数值具有明确单位；参数可推导值不重复存储 |
| apiBindings | 调用配置数组，key 在模型内唯一；公开调用入口至少有一个完整、实际支持的 binding |
| defaultBindingKey | 有绑定时引用已启用 binding；无绑定时为 null；不能指向不存在项 |
| content | overview、strengths、limitations、useCases、quickStart、FAQ、sources；文字本地化 |
| showcase | 展示样例数组，包含文字、提示词、媒体引用、参数、来源；实际模型输出与说明素材分别标记 |
| presentation | featured、sortOrder、relatedModels；关系保存内部 UUID |
| seo | 标题和描述默认来自当前语言 title/summary，可覆盖；分享图可选；allowIndex boolean 默认 true，false 时详情可访问但noindex且排除sitemap/索引型翻译链接 |

草稿集合显式使用 drafts.validate:false，允许业务必填和自定义 validator 暂未满足；类型、结构、存储界限、唯一性、选项候选与引用授权始终执行。发布和独立校验接口执行完整的所选规则，自定义 validator 不作为跳过校验草稿的安全边界。自动保存间隔显式为 10000 毫秒，计划发布启用。空集合返回真实空列表，必需站点配置未发布返回明确不可用状态。

## 2. 调用配置、场景和模板

`apiBindings[]` 包含 key、profileKey、inputModalities、outputModalities、capabilities、enabledFlowKeys、constraints、scenarios、recipeKeys、defaultScenarioKey。input 支持 text/image/audio/video；output 增加 vector。只发布已有可执行适配的 profile；技术声明保存在 technicalCapabilities，binding 只描述平台开放范围，且不能超出技术声明。无 Core 支持的展示模型允许空数组及 null 默认绑定，公开 DTO 明确 platformAccess=unsupported；实际 key/路由是否可用仍由 Core 查询决定，不持久化瞬时状态。

tasks 受控词表包括 chat、reasoning、coding、image-generation、image-editing、video-generation、speech-recognition、speech-generation、music-generation、embedding、reranking。features 包括 streaming、tool-use、structured-output、prompt-caching、local-deployment；新增真实业务项需同步合同和译文。q/category/task/input/output/capability 等普通目录筛选针对技术声明；平台执行组合通过独立 callable 过滤，并要求同一 binding 匹配，不能混合不同绑定形成假支持。

`scenarios[]` 包含 key、本地化 title/description、flowKey 和 requestValues。requestValues 只保存样例 body/query/path/file 引用；modelId、平台地址、认证占位符由受控 renderer 注入。示例值不作为业务默认值或真实执行结果。场景必须通过最终合同校验。

模型编辑器按[字段编辑约定](MODEL-EDITOR.md)提供分区、语言选择、来源表单和请求参数表单，保持原存储字段与公开数据形状。请求表单由现有 profile/flow 请求合同生成，编辑行身份不进入示例请求。接入输入、输出及能力由已选 profile/flow 确定，保存前统一生成；缺省模板为 core.http，单场景接入自动提供默认场景。运营声明的模型技术能力仍独立维护，最终发布继续检查技术范围及请求有效性。

parameterReference 的字段类型为 text/textarea/select/number/boolean/url/array/object，预设以稳定key关联输入值。它表达资料中介绍的参数，不作为Core执行参数来源；有binding时公开API参数说明与示例按实际profile合同生成，允许复用文案但不双存约束。无binding时保留独立的资料参数编辑面板、加载/reset/校验/焦点和复制，复制形状为 `{modelId,scenarioKey,inputs}`，明确标记本地资料映射。参考字段不提供调用地址或真实执行按钮。

`ApiProfile` 是装配配置，包含稳定 key、协议、操作、请求定义、modelId 注入规则、参数合同、响应处理和流程。公开定义只输出必要安全元数据，不输出密钥或上游内部地址。

流程使用判别结构：普通响应、流式响应、异步任务、实时会话按真实接入实现。普通与流式响应区分 JSON、SSE、字节和音频流；异步任务包含 submit、poll、终态、deadline、结果获取，只有真实支持时才包含 cancel。禁止所有流程共用缺失步骤的万能 POST。

`IntegrationRecipe` 是受控模板，包含 key、HTTP/SDK/tool 入口、适用 profile、所需能力、支持的语言 renderer、安装/配置步骤、文档关联及已验证版本。模型只引用已存在模板，不储存六份可漂移的程序。

图中 API、SDK、Claude Code、Codex 等入口不因名称存在而启用。用户已确认扩展Core0.24.0真实MiniMax执行；不注册Messages/Responses/向量的执行器。真实profile为core.chat、core.image-tasks、core.video-tasks、core.music-tasks、core.transcriptions。新增music.generate、audio.transcribe及video.minimax-h3、video.minimax-h3-highspeed、video.minimax-h3-lite、video.minimax-h3-max；H3逐型号校验实际分辨率/4–15秒（Max5–15秒）合同。公开示例使用 oak_ API Key 和每次明确意图唯一保留的 Idempotency-Key，不暴露session或服务令牌，不默认重试付费POST。

Core 0.24.0 的 chat 仅接收 model、messages、max_tokens、stream、temperature；messages 为1–128条字符串消息，max_tokens 为1–65536并受目录限制。无工具、多模态content parts、Responses/Messages或思考参数。SSE必须收到[DONE]才成功。任务POST为 `{kind,model,input}`，202返回服务端task ID；详情GET和PNG/MP3/文本content使用原API Key。视频从已结算详情读取临时provider URL，下载不附加用户Key。公共任务API没有lookup或列表路由，不能从session/BFF路由生成假公共示例。精确模式参数从已有Core验证器合同提取并锁定测试，不根据供应商文档猜字段。

新增音乐场景requestValues为`{input:{prompt?,lyrics?,is_instrumental?}}`，必须满足纯音乐描述或非纯音乐歌词要求；返回每次生成的MP3私有产物。ASR场景requestValues为`{language?}`，文件是运行示例时显式提供的`ONEASTER_AUDIO_FILE`本地PCM WAV，不在CMS保存音频或服务器路径。公共POST `/v1/audio/transcriptions`以multipart发送model/file/可选language，原Key和稳定意图；202后仍轮询`/v1/tasks/{id}`，仅settled输出识别文本。受限16位PCM、1/2声道、8–48kHz、120秒/8MiB，Core独立校验真实字节与时长。示例不重复POST，未知状态保留意图并退出；不得把session路径或内部keyId输出成公共例子。七语言同一请求规范，音乐保存result.mp3、ASR打印已结算text，H3输出临时URL，不向供应商CDN附带用户Key。

## 3. 全站内容单元

| 集合 | 数据与消费面 |
| --- | --- |
| developers | 稳定身份、名称、Logo、官网；模型引用 |
| models | 第 1、2 节；目录、详情、推荐、文档指南和试用关联 |
| documents | slug、title、summary、navigationLabel、order、结构化正文 blocks、SEO、模型关联；支持现有文档渲染能力 |
| site | 单例；品牌、导航、Footer、公开 API 地址、默认文档、SEO；现有链接动作语义保留 |
| home | 单例；hero、推荐模型、workspace、useCases、FAQ、closing；现有视觉组件只适配数据 |
| languages | 非本地化语言目录，code、label、shortLabel、htmlLang、direction、enabled、default；原生localeSource在事务内解析；canonical code最多32字符且创建后固定；仅禁用，不归档或清除；默认语言通过受权原子操作切换，启用须完整当前软件消息 |
| messageBundles | contractVersion、locale、namespace、messages；三字段唯一；验证客户端要求的键、ICU 参数与标签；专用搜索/编辑体验避免无约束整页 JSON |
| media | 复用上传集合；按确实需要的图片/音频/视频格式补全 MIME、大小、处理及公开绑定，不接受未验证媒体类型 |

UI 消息的命名空间合同由客户端渲染需求定义。实际软件译文作为显式初始化命令的输入，首次插入en/zh语言定义及完整消息；重复运行只补缺失，不覆盖编辑，不创建模型或首页demo。启用新语言前必须有对应已接受消息合同的完整bundles；跨记录检查在content同一写事务内执行，不能用afterCommit或客户端预检代替。初始化前client只显示同语言软件界面及初始化/空内容状态。

## 4. 新公开读取合同

参数平铺；可选 locale 默认部署默认语言。返回值包含合同版本 `oneaster-public.v1`、实际 locale、最终表示 revision 及具体 DTO。分页默认 page=1、pageSize=20，上限 100；q 最大120字符，ids最多100个UUID，sort为order/title/updated且以UUID兜底；query未知字段拒绝。内部UUID保持string，不保留数字ID双收。字段长度及数组预算由对应schema定义并纳入生成合同，不能静默放宽已有校验。

模型卡片只读取身份、分类、规格、技术声明、展示排序、Logo、SEO 和绑定 key。卡片的 apiBindings/showcase 为空数组、defaultBindingKey/parameterReference 为 null、content 为空对象；platformAccess 仍按实际已发布绑定判断。完整调用配置、资料参数、介绍和样例由详情读取。文档导航与索引只读取相应摘要字段，sitemap 只读取路径、语言和索引许可；当前 schema 在 native SQL 读取前投影，历史 schema 完整迁移后投影，不向外开放内部 projection 参数，也不改变管理 select 或权限。未读取的媒体引用不参与摘要媒体扩展。

发布文档采用 docs-body.v1 结构投影，保留数组 UUID 与代码原文；装配媒体前的公开正文最多 1 MiB、30 个 section、每 section 30 个 block、合计 300 个 block。公开富文本最多 5000 个节点、深度 16，节点和链接只接受当前客户端渲染合同。默认文档 slug 和首页 FAQ key 使用小写连字符标识，FAQ key 不重复，文档排序为非负整数。可选文字允许未配置的空串，已填写文字不能只有空白；公开整数均限制在 JavaScript 安全整数范围。sources.supports 为至多 100 项的非空字符串数组，每项最多 2000 字符。语言标签不能空白，htmlLang 为空或 canonical BCP47。参数默认值、场景值和样例 settings 的单值最多 12000 个 Unicode 码点、8 层容器、合计 256 个条目；拒绝非有限数、稀疏数组和保留原型键。

| 路由 | 结果与一致性边界 |
| --- | --- |
| GET /v1/public/interface | 必填messageContractVersion；启用语言、当前语言site、安全UI messages；同一事务内聚合，返回精确匹配版本，无匹配完整合同为503 |
| GET /v1/public/home | 首页区块、实际已公开推荐模型及关系 |
| GET /v1/public/models | cards、pagination、facets；支持 q/category/task/developer/input/output/capability/featured/callable/ids/sort；排序使用稳定 UUID 次序兜底 |
| GET /v1/public/models/:slug | 完整模型、调用配置、资料参数、展示样例、相关模型；不能包含草稿 |
| GET /v1/public/docs | 入口正文、最多100项导航窗口、总数和索引导出入口；不内联全量模型指南 |
| GET /v1/public/docs/:slug | 正文、同样有界导航窗口、实际翻译关系、SEO |
| GET /v1/public/index | kind=documents或model-guides、locale；完整摘要一致读导出，供独立搜索/分页导航消费；普通docs接口不截断假装完整 |
| GET /v1/public/sitemap | 单个一致读、流式路径导出；语言、首页/模型/文档实际公开路径和索引许可；可选稳定hash分片参数，不用offset |
| GET /v1/public/media/:bindingId | 只允许已公开 revision 引用的媒体绑定；stream、Range、HEAD、条件请求按媒体类型校验 |

索引/sitemap 使用 `application/x-ndjson`。首帧start包含合同、kind、locale、导出ID；中间item包含序号与安全DTO；末帧end包含总条数及所有item规范化字节的SHA256。缺末帧、计数/序号/摘要不匹配、错误帧或截断均整体失败。首字节前出错使用普通错误envelope，开始流后发送error帧并中止，不能当HTTP200成功。总量最大100000项/32MiB、每帧最大256KiB、每批最大100项；单实例导出准入1、写空闲2000ms、CMS总时限15000ms、client总时限20000ms。事务与连接直到完成或中止才释放，期限覆盖慢消费者且不受背压无限延长。client解析/索引上限128MiB，超限不输出部分结果。

sitemap分片采用固定16个路径hash桶，由合同版本固定归属；每个分片独立一致读，每条canonicalPath恰好属于一桶。client sitemap index列举固定桶入口，不以并发变化的总数计算offset。空桶输出合法空集；单桶超容量明确失败并要求扩容发布，不静默丢路径。此为独立请求边界一致性，不承诺搜索引擎多次请求冻结整站。

sitemap 参数仅支持 bucket，不接收 locale；每桶包含所有启用且实际公开的语言。公开 API base URL 必须为 HTTPS 或回环 HTTP 的 /v1，禁止认证、query、fragment、空白和反斜杠，主机为合法 DNS 名或 IP。所有语言模板对 base URL 和请求值分别安全编码，不能将 CMS 文本拼入程序语法。

每个接口的精确schema、预算和SDK模板与可审阅合同产物同一来源生成，客户端消费该产物并做契约测试。公开数据、权限和集合配置的变更不能依赖进程内旧副本；额外缓存默认关闭。

请求失败沿用现 CMS `{error:{code,message,requestId,fieldErrors?}}`。非法输入 400、未公开/不存在 404、唯一/版本冲突 409、超大 413、限流 429、依赖不可用 503；未知错误 500 且不暴露 SQL/密钥。公共 JSON 成功为 200；只有存在对应表示的条件请求才可返回 304。内容不可用与空列表分别表示。

## 5. 预览单元

新增 `POST /v1/collections/:collection/documents/:id/preview-tickets`，集合权限操作，body为locale和expectedRevision，成功201返回ticketId、expiresAt与可信client预览入口。仅允许公开交付白名单中的模型集合；发布与查看草稿权限仍分开。新增 `DELETE /v1/collections/:collection/documents/:id/preview-tickets/:ticketId`，签发者或具有相应管理权限的管理员可撤销，幂等200且记录审计。新增 `GET /v1/preview/models/:slug?locale` 和 `GET /v1/preview/media/:bindingId`，均必须携带短期grant，不保留旧预览路径别名。

预览分享仅支持交互式管理员会话。CLI/API OAuth、MCP OAuth和Agent API Key交换得到的API access token即使具有模型读与预览签发operation，也不得签发预览票据；业务在读取文档、拼接slug、保存票据和票据审计前返回forbidden。委托凭据仍按原operation与collection范围使用其他原生文档能力。当前系统不创建委托来源的预览票据，因此持有grant读取以非委托issuer身份重新检查当前角色、集合与字段读权限；不将委托凭据静默提升为管理员分享权限。完整委托预览若另行启用，须显式保存并逐次重查原始授权来源及完整撤销链。

grant使用至少256位随机值，仅摘要入库，绑定issuer、collection、document UUID、versionId、locale、client origin、expiresAt与revokedAt；最多600秒。签发和读取通过注入的access能力重新检查issuer当前有效身份/读权限，不接受客户端自报actor。篡改、撤销、过期、跨模型/语言/revision、已清除revision和无权限均拒绝。清理通过现有有界维护执行器，过期判定不依赖清理已运行。

完整预览使用签发者当前`documents.get`上下文，对固定revision的实际完整数据执行原生`projectData`字段read策略。权限投影移除任何实际字段时拒绝预览，避免正文、SEO、调用样例或私有媒体绕过字段权限；未存储值的隐藏可选字段不阻断。签发在保存grant、审计票据和拼接slug之前检查，拒绝返回forbidden且事务不保存票据。模型、代码示例和私有媒体每次读取都重新授权并重新检查字段策略，失权统一返回unauthenticated；不使用签发时缓存的字段权限。普通匿名已发布投影合同保持独立。

client入口 `GET /api/content-preview` 先向CMS校验grant，再设置HttpOnly、SameSite=Lax、生产Secure cookie并303跳转；清除入口 `POST /api/content-preview/exit` 校验Origin，并以cookie中的grant调用 `POST /v1/preview/revoke`，CMS将对应grant撤销且幂等返回200。撤销提交后该grant的所有副本不能发起新的资料或媒体读取，已开始流按授权时点处理。CMS不可达时client仍清除本地cookie，但不得宣称服务端已撤销，剩余grant按原期限失效并显示可重试状态。

撤销请求体必须实际为空；Node HTTP 传来的零字节 ReadableStream 同样视为空体，任何非空字节均拒绝。

预览媒体使用同源 `GET /api/content-preview/media/:bindingId` 代理，从cookie转交授权；CMS检查该binding属于grant固定revision，禁止任意URL代理。range/head及流取消清理与公开媒体一致，但始终private/no-store。预览完整流程noindex/no-referrer，不输出公开canonical/结构化数据，不自动触发Core执行。

## 6. 客户端行为单元

模型目录保留搜索、组合筛选、收藏、分页、浏览器 history 和返回目录上下文。收藏采用新 UUID key，不迁移旧数字收藏。语言切换保留 Core 试用意图和会话状态。

真实试用与资料参数编辑分别显示，复用已有 Studio/Media Studio：文本 key/输入/估算/会话/轮询/历史；图像与视频各自参数/报价/提交/lookup/任务/媒体历史。绑定只传业务 modelId，不以 slug 或 CMS id 替代。

内容安全 renderer 迁到 new-cms 节点合同，保持富文本语义、代码原文、链接边界与媒体来源；未知节点、非法链接、越界深度/节点/字节明确拒绝。

## 7. 配置与观测

client保留语义明确的 `ONEASTER_CONTENT_ORIGIN` 作为唯一CMS来源，删除旧独立 `CMS_URL/CMS_PREVIEW_SECRET`；构建/运行origin一致性校验保留。CMS新增 `ONEASTER_CLIENT_ORIGIN` 为可信预览目的地；opaque grant不需要client共享签名秘密。Core origin与认证配置保持独立。预算由应用配置注入，禁止在底层散落常量。

默认不持久缓存公开正文。若使用 ETag，客户端缓存以完整 URL、语言、合同版本为键且容量有界；304 只能复用对应 body。日志包含 requestId、operationId、状态、耗时、预算拒绝、Core 错误分类，不包含预览凭据、用户 key、完整生成输入。

## Seedance 2.5主线能力保留

core.video-tasks新增独立video.seedance-25-text，复用Core主线bytedance/seedance-2-5合同：仅prompt/aspect_ratio/resolution/duration，prompt最多20480个Unicode码点，比例1:1/4:3/3:4/16:9/9:16/21:9，分辨率480p/720p/1080p，时长5/10秒。不允许camera_fixed（包括false）、参考图、上游nsfw_checker或其他透传字段；Core固定的供应商参数不在CMS复写。旧video.seedance-text仍为10000字及原9:21模式，不借旧flow宣告2.5扩展。绑定声明的字数、比例、分辨率与时长也不能超过选择的流程；报价与可提交组合始终取Core实际已配置目录，不在CMS复制供应商采购价或猜售价。公共body保留256KiB上限，示例语言安全编码后仍保真。
