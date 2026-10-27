# Collections 草稿控制

集合 mode 继续区分 direct 与 drafts。drafts 模式使用单一 drafts 配置：validate 默认 false，autosave 默认 false，schedule 默认 false。autosave 可设 true 或 {intervalMs}；编译配置时补全实际间隔，缺省为 2000 毫秒，正整数且不超过浏览器定时器的有效范围。direct 不接受 drafts 配置。应用集合显式配置自动保存和调度入口，保存校验按各集合实际草稿规则启停。

validate:false 保存草稿时跳过必填和自定义 validator，但始终保留类型、结构、标识、字段规则的物理存储界限、JSON 大小、引用授权和资源限制。validate:true 对请求涉及语言的最终候选执行必填和自定义规则，validator 上下文仍是 draft，且不执行 beforePublish。发布及独立 documents.validate 的显式 draft/publish 校验不受保存配置关闭影响。应用集合允许不完整草稿；网站默认文档 slug 的保存约束通过验证前字段钩子维护，文档顺序受数值边界约束。完整公开内容要求在发布时校验。

自动保存服务端操作、编辑器 intent、动作、集合能力和实际定时器读取同一配置。间隔在响应中返回，编辑、语言切换、配置重载和卸载清理旧定时器；继续沿用修订 CAS、编辑租约和幂等键。关闭调度禁止接受、重放和后台执行计划发布或撤回；取消已存在计划不受此开关阻断，单条即时发布仍可用。

行为配置无需新增 SQL 迁移。切换时停止旧版本写入、更新配置并重启 API 与 worker，使后台以当前配置重新授权。回滚使用配套配置、产物和应用；已经失败的任务不自动重新排队。观测 invalid_input/forbidden、队列项结果、修订数和自动保存请求节奏，通过直接 API、配置变更后的 worker、取消、只读验证及编辑器交互回归核对。
