# Collections UI 接口补面测试矩阵

状态：定稿，2026-10-26。测试口径先于实现；最终数字按实际全仓运行记录。

| 单元 | 正向 | 反向/边界/并发 |
| --- | --- | --- |
| editor | 全字段和展示树、array/block分支、read/写schema、locale/fallback、实际upload预算、只读join | 隐藏父子/容器默认对象内的secret/选项不泄露、read允许query拒绝、nextData策略conditional、无操作绑定/其他scope、草稿/直接模式、真实文档谓词/归属/版本、未知参数 |
| jobs列表 | 内容/资产统一排序、刷新/换设备发现、计划定位、末页total、空页 | 撤权/禁用、异scope、隐藏来源/结果条目和计数、过滤投影状态、非owner内容可见规则/资产actor隔离、复杂where/locale、新list操作自身Where、超过一页的不可见前缀、有界SQL数量 |
| uploads列表 | 各状态/用途/关联文档、声明信息、分页与详情一致 | 他人/超管不得越过actor、已消费绑定读取权限、过期/取消/失败、未知条件、页上限和取消 |
| cleanup | 超管列表详情、202重试后维护删除、CLI共用实现 | 普通主体403、无幂等键/冲突、未知404/非blocked409、审计失败回滚、撤权重放、有效引用/保留/在途写保护、并发重试和旧generation失败回写 |
| HTTP/OpenAPI | 新6操作注册、路径/query/body、正确DTO/状态码、private/no-store | DTO与schema吻合、严格未知字段、HEAD继承、无SQL平台导入、目录绑定规则和旧69接口回归 |
| 迁移/角色 | 从原链升级保留checksum/数据、非owner运行新接口 | 元数据仍SELECT-only、未知表/列权限拒绝、旧迁移不得修改 |
| 网络旅程 | Bun/Node真实进程，创建工作后刷新枚举、计划发现、上传处理和安全编辑元数据 | 改权限后rows/total和详情即时收敛，重启保留工作，故障账本重试不假报已删 |

沿用现有真实 PG/SMTP/S3 装置。每个已证实 bug 保留缺陷前后证据；不新增 skip/only/todo，不弱化断言、include/exclude或90/85/90/90阈值。四门与独立审查全部通过后才核销。
