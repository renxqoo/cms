# 新CMS跨仓验收记录

2026-10-27。本轮无旧CMS内容迁移，代码及生成物单轨切换；运行手册见[OPERATIONS](OPERATIONS.md)。CMS最终完整门禁尚在执行，完成后填写准确数字；未执行成功的检查不计通过。

## 客户端与真实执行

客户端Bun1.4.3完整lint/typecheck/build/test通过：278文件3669单测，开发与生产各7浏览器冒烟。覆盖率statements91.28%、branches89.97%、functions90.63%、lines93.59%，配置范围门禁全部通过，未降低阈值。最后候选真实服务18项English桌面/手机旅程全部通过，包括原生发布、目录/详情/示例/文档/首页、登录与账务只读、插件Studio、预览安全与退出撤销、双Node发布/媒体一致性。真实服务旅程禁止生成POST，实际执行证据单独记录。

真实客户端五次生成意图分别为文本、图片、ASR、音乐与视频，各一次，没有重复提交。文本OK结算210微点；图片实际PNG结算10微点；4.097438秒WAV真实转写按5秒结算50微点；原视频任务成功结算40微点并实际播放，readyState4、864×480、currentTime0.825696秒。音乐HTTP410/2153拒绝且释放预留、扣费0。供应商[音乐说明](https://platform.minimax.cn/docs/api-reference/music-generation)记录2026-08-20起新用户限制；该项为外部服务/账户阻塞，不能写成已生成。

实际逐请求reserve和settle/release各一，5请求总charge310微点、Key spent310、Key reserved0、wallet reserved0、wallet balance9999690。视频早期结果域名被拒绝，新增实际返回的精确OSS host+MP4规则后由原任务轮询恢复，未手工结算或重复生成。运行时及验收工具的正反例独立审查分别关闭。

## 双实例容量样本

同机双Node实际dist、共享独立UTF8 PostgreSQL和S3协议HTTP测试服务，1000次匿名完整读取，并发8；interface/home/catalog/detail/docs各200次，5模型数据。0失败，3351.54ms、298.37req/s，p50/p95/p99为21.41/55.87/76.50ms，两节点各500响应。每次校验完整发布schema和业务字段。

RSS前后primary147744/217744KiB、peer169008/244768KiB；数据库业务role连接前active/idle/total为0/7/7、后3/12/15，158次20ms采样的各状态最大值11/12/15（并非同一时刻相加），前后idle-in-transaction为0。实际max_locks_per_transaction=1024，观察连接不计业务role。入口bundle SHA256为8e6bb670bfc2535b07d05f9fa6fe3743b84855ec60e8c9840f07f554ab630311，包含字段级预览授权和公开媒体CORP修复。

这是内部HTTP、5模型、短时同机样本；不包含TLS/远程数据库/真实S3成本，不能推导生产SLA或长期内存稳定性。Docker daemon不可用，不能将原生隔离PG与真实HTTP验收写成Docker部署脚本通过。尚未部署，线上数据库灾备、云存储与RTO/RPO由实际部署演练确定。

## 实际停止与重启节点

主动停止primary并确认原地址不可连接后，peer readiness200；稳定TLS入口仍返回5模型目录与完整5项索引，精确业务modelId保持，绑定PNG的GET/HEAD/Range及SHA256一致。实际client生产SSR目录、文本详情、getting-started文档均200并含真实业务内容。primary在新端口重启后再次得到同样目录/索引/媒体摘要和三页SSR200；代理记录23次安全读取fallback。没有重放管理写入或付费生成POST。

故障及恢复分别保存独立时间戳报告；这些是同机进程故障证据，不等于跨区域故障、数据库主从切换或对象存储灾备已验收。

## 实际数据库中断与恢复

停止仅此world独立PG（不停止Node）后，两节点readyz和稳定CMS目录/详情均503，明确temporarily unavailable且不返回空集合成功。client两页SSR仍用200页面壳展示明确unavailable，未误报404或空业务成功。恢复同datadir、无重seed/无Node重启后，两个Node自行重连，readiness200；5模型目录、完整5项索引、同媒体SHA256/HEAD/Range、三页实际业务SSR再次正确。随后所有本轮真实QA进程与独立PG正常关闭，最终Core工具账本复核310微点、所有预留0。

本轮最新发布边界：用户最新要求CMS/client先提交、push并合main，再完成验证；oneaster-backend最后仅提交PR、不合main，PR无法提交可提交issue。Backend本地已验证提交de75435；当前GitHub身份对该private仓库只有pull、push=false、allow_forking=false，HTTPS与SSH身份一致，403阻止分支上传和有效PR创建。没有绕过访问控制或将私有代码发布到无关仓库。
