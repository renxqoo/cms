# 资源管理界面与私有文件验证

状态：资源实现及专项验证，2026-10-26；范围按[内容与资源实施契约](admin-content-implementation.md)。全仓四门、主分支和 CI 由应用集成批次统一核销。

## 当前实现

`/dashboard/resources` 通过真实资源接口读取分页、搜索和安全媒体元数据，展示私有预览、可见引用及集合文档入口。上传预算来自当前集合的 create editor，消费文档的动作提示、实时操作许可及读取依赖共同决定入口是否可用。上传会话可从任务页跳回资源页重新发现；任务入口使用唯一的 `tab=uploads` 查询契约。

上传队列同时最多处理两个文件，队列最多二十项。原始字节通过既有 XHR 传输报告实际进度，服务端 processing、ready 和文档 consumed 分开呈现。create/complete 的未知结果保留同一幂等意图，失败字节只通过新会话显式重试。429 暂停其他在途工作及后续排队项，保留 Retry-After，只有用户显式核实后继续。轮询间隔十秒，自动等待最多五分钟；隐藏、离页和卸载停止前端请求及计时器。

文档媒体组件使用同一修订进行文件替换，ready 后显式 PATCH 消费上传。替换和图片重处理持有父编辑器的写通道，终态及文档刷新确认后才释放；未知写入通过实际上传状态和不可变文件清单核对。新建上传的忙碌状态在 ready 后释放，使文档保存能够消费当前 uploadId。

图片编辑从原件尺寸计算整数像素 crop，并验证 focal point、变体数量、尺寸、格式及质量预算。图片编辑预览固定原件；处理 202 后读取持久任务，成功后重取文档与安全 metadata。私有文件只通过认证 BFF 取得 Blob，当前及历史文件按 versionId 读取，引用按来源文档 bindingId 读取。PDF 提供下载；替换、撤权、错误和卸载回收旧 Blob URL。

## 文件句柄所有权

本地驱动使用单一登记表保存每个句柄的完整释放能力。打开和写入阶段登记文件关闭能力，读取流创建后替换为流关闭能力；内层 reader 已取消或到达 EOF，并且显式 `file.close()` 完成后才结束登记。流创建异常由原读取入口关闭；读取前后检查取消，避免取消被误报为空的成功响应。关闭过程共用单个 Promise，释放 reader 锁、移除监听并结束句柄登记。底层读失败导致 cancel 拒绝时仍执行关闭和登记释放。

存储关闭会终止尚未消费的外层流，并等待全部登记资源的 reader、文件与监听释放；清理失败聚合抛出。使用同一未取消信号连续四轮预取、关闭存储后，监听数量均为零，外层 reader 的关闭状态明确失败，消费者无需再执行取消来释放底层资源。

真实 Node 26.9 的修复前证据包括：打开期间取消读取后在 GC 崩溃，以及启动读取后取消被误判为空成功。正式回归通过公开 Storage API 覆盖这两个取消交错、消费者取消、正常 EOF 和服务关闭，并在真实 Node 开启 GC 后验证进程零错误退出。

## 已执行检查

| 检查 | 实际结果 |
| --- | --- |
| 资源近置行为测试 | 8 文件、52 例通过 |
| 资源定向 Istanbul | statements 93.56%、branches 88.11%、functions 90.61%、lines 96.95%；本次诊断匹配范围的 90/85/90/90 门槛通过 |
| 存储近置测试 | 5 文件、17 例通过，包含真实 Node 六种生命周期和 Bun 取消交错、预取流关闭、底层错误释放 |
| TypeScript | `bun run typecheck` 通过 |
| 规范 | 本批文件的类型感知 Oxlint 与 Oxfmt 检查通过 |
| 浏览器 | 三个隔离 spec 合计 12 例通过：`admin-assets` 4 例、`admin-images` 6 例、`admin-upload-recovery` 2 例；开发 Bun API/Next 与生产 Node API/Next 的所有进程干净退出 |

资源定向覆盖率只匹配 `apps/admin/src/features/assets/**`，不作为全仓或整个前端的覆盖率结论。存储专项运行未单独统计覆盖率。全仓 lint、build、test 及完整覆盖率以应用集成批次的最终结果为准。

浏览器按 spec 隔离数据库、SMTP、存储和进程，保留真实限流。处理终态通过可执行的 UI 状态和独立持久化读取验证；预期 415/403 按精确方法、URL、状态和次数登记，其他浏览器错误仍须为零。

主要证据位于 `/private/tmp/cms-assets-coverage.log`、`/private/tmp/cms-storage-stream-before.log`、`/private/tmp/cms-storage-prefetch-before.log`、`/private/tmp/cms-storage-prefetch-after.log` 及 `/private/tmp/cms-assets-release-browser.log`。修复前的 StrictMode、图片原件预览、限流队列、消费权限及详情读取回归各有独立日志；正式回归保留在对应近置测试。

真实云账号、容量压测、故障切换和部署不属于本批执行结果。
