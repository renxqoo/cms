# 任务、上传发现与清理界面验收

状态：业务界面及定向验收已完成，2026-10-26；全仓四门、独立审查与提交由集成阶段统一核销。本轮不部署、不执行DDL。

## 当前行为

/dashboard/jobs 从真实 collections.list 获取当前可发现集合，按 collection scope 分别读取 content.listJobs 与 assets.listUploads。任务和上传使用各自严格的 action/status/purpose/documentId/page/pageSize 契约，未知参数不传给HTTP。rows/total直接使用授权后的服务端结果，不在前端伪造总数或分页。内容专用集合切换到上传页时选择实际上传集合。

任务详情区分内容任务和资产任务，内容展示指定修订、版本、计划时间及逐项结果；资产展示处理状态、尝试次数和安全失败代码。jobId查询参数支持刷新后重新读取详情。发布计划取消与上传取消使用真实DELETE，只有确认响应才显示请求已确认；未知结果禁用盲目重复提交。随后真实读取cancelled时，界面明确显示服务端当前状态已取消，收起过时的未知提示，不把状态核实当作原写入回执。上传会话链接回资源页的collection/uploadId恢复入口。

列表与详情最多各一个轮询器。列表至少10秒、详情至少5秒，整段等待上限5分钟。hidden、终态、错误和429停止自动轮询；恢复可见时先核对原截止时间，超时不能自动发出新读取。Retry-After在显式继续前仍生效；切换查询、身份或卸载会终止在途读取并拒绝迟到结果。暂停时保留已确认数据，明确显示可继续核实，不把远端任务声称取消。

/dashboard/asset-cleanups 只向具有实际security许可的主体提供安全账本，查询blocked=true和blocked=false分别表示阻塞及未阻塞记录。详情不暴露存储key或提供方原始错误。blocked重试携带同意图UUID和空JSON对象，未知结果保留幂等键，刷新后即使账本不再blocked也可重放同一意图以核实受理。202只显示受理，保留期、引用和在途写保护仍由后端裁决。

两个服务端入口先验证会话，前端按当前授权快照决定读取和动作；真实API再次鉴权。页面使用既有UI、表格、弹窗、共享查询导航和唯一API client，提供中英文、390窄屏和键盘关闭行为。

## 定向验证

- 6个近置测试文件、31个规则/DTO/组件/生命周期用例通过，覆盖精确筛选、分页、kind投影、服务端会话拒绝、取消、未知写入、同意图重试、失权、请求取消与轮询边界。
- 新模块诊断覆盖范围为features/jobs、features/asset-cleanups、contracts/jobs.ts、contracts/cleanups.ts及两个页面；本轮实际statements99.14%、branches93.41%、functions99.29%、lines99.66%，诊断范围内门槛通过，不能外推全仓覆盖率。仓库配置与90/85/90/90门槛未改。
- bun check -p apps/admin通过；定向类型感知oxlint和oxfmt通过，Next生产构建由真实浏览器入口执行。
- e2e/admin-jobs.browser.spec.ts、e2e/admin-job-uploads.browser.spec.ts、e2e/admin-job-access.browser.spec.ts与e2e/admin-asset-cleanups.browser.spec.ts各自使用独立world，开发Bun API/Next与生产Node API/Next共8条真实浏览器旅程：发布计划刷新发现及取消、390窄屏上传刷新发现及取消、普通管理员无集合任务/清理访问、清理202受理且保留期未绕过。

清理旅程仅在隔离测试数据库中建立blocked pending前置账本，验证真实HTTP重试、审计/幂等和保留期结果。该前置状态不作为真实提供方删除故障的证据；存储失败仍由既有后端故障回归验证。页面旅程未接触部署数据库或真实云账号。

两个命名回归具有实际修复前失败与修复后通过证据：内容专用集合切换上传页沿用无效collection，导致空列表；页面隐藏超过截止时间后恢复可见，又发出一次自动请求。正式回归保留，不放宽超时、覆盖率或加入重试/skip。
