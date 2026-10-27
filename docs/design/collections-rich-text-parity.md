# Collections 富文本契约

状态：已实施并通过四门。参考 Payload aebbf75b 的默认 Lexical 功能；后端和界面共用既有富文本字段，不引入第二套内容引擎。

## 数据与行为

唯一持久化格式保持 `version: 1, children`。内建节点为 text、paragraph、heading、list、listItem、link、relationship、media、quote 和 horizontalRule。text 的可选 format 是不重复的 bold、italic、underline、strikethrough、subscript、superscript、code 数组；不接收任意 CSS、HTML 或脚本。heading 的 level 为 1 至 6，省略表示 2；list 的 kind 为 bullet、number、check，省略表示 bullet，number 可带正整数 start，check 子项可带 checked。块的 align 为 left、center、right、justify，indent 为 0 至 8。省略属性沿用已有默认值。

编辑器提供格式、多级标题、段落、三种列表、引用、水平线、对齐、缩进、链接、关系和媒体；继承真实撤销重做、字段权限及固定历史媒体语义。粘贴通过有界白名单净化，拒绝脚本、事件属性、任意样式和外部媒体自动入库；安全文本及支持的格式保留。未适配的受信任扩展仍完整保留并进入结构编辑，不执行 HTML。

## 发布与回滚

新读取器兼容所有既有 version 1 数据，新增节点及属性使用相同格式，不写双轨字段。上线先排空旧 API writer，再切换新 API 与管理端；旧 writer 对新增属性严格拒绝，因此不能混跑。验证创建、保存、读取、历史恢复及格式无损，观察 invalid_input、编辑校验和冲突错误；失败保持原已保存内容。删除条件为新版本四门及真实旅程通过，无旧节点转换器需要长期保留。已有新增格式数据后回滚需先备份并运行显式逆向内容转换，或前向修复；不能直接切回不能读取新增结构的旧管理端。

## 验证

后端严格校验及预算、前端无损映射、格式与工具栏、列表/缩进/引用、危险链接与粘贴、监听清理、旧 AST、扩展节点和持久化历史的针对性测试为 18 文件、202 用例，全部通过。新增格式前保留 2 个公开回归失败；修复后通过。真实 PostgreSQL 旅程验证发布快照及历史恢复保持格式。

完整 lint 零错误零警告，检查 1052 文件；typecheck 分别检查 461、63、766 文件，生产 build 通过。完整 test 包含 Vitest 258 文件、2291 用例，Bun/Node 网络旅程 3 文件、8 用例，以及开发/生产浏览器 21 组、112 条旅程，全部通过。Istanbul 全仓覆盖率为 statements 93.87%、branches 89.18%、functions 96%、lines 96.56%；配置全局及独立范围门槛均通过，未调整范围或阈值。

新增独立 `admin-rich-text.browser.spec.ts` 验证全部文本格式、H3、列表转换、键盘勾选、对齐缩进、真实保存重载及 390px 无溢出。工具栏超宽曾令既有窄屏断言失败，修正分组换行后开发和生产全部通过。旅程使用独立数据库/SMTP/存储世界，不提高限流。

导航响应捕获仅拦截指定 method/path，通过真实 route.fetch 发送一次原请求，先缓存完整字节再原样 fulfill 状态、头和体，随后校验 JSON 并释放 APIResponse、route 和关闭监听；不重发请求、不制造响应、不延迟导航。原 Chromium 响应体在导航后失效的失败已留在工具日志，修复后原内容旅程与富文本旅程均通过。最终日志位于 `/tmp/cms-rich-text-{lint,typecheck,build,test}.log`。
