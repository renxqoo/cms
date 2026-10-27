# Collections 查询与预设契约

本次授权为对齐本地 Payload aebbf75 的 Collections 产品能力，保留 Hono、PostgreSQL、现有权限与资源预算。本契约覆盖查询运算、列表组合筛选和持久化预设。

## 查询

同一 Where AST 增加 all、like、notLike、near、within、intersects。like 对空白分词后执行不区分大小写的全部词包含，notLike 对完整正向结果取反；用户输入的 SQL 通配符按字面值处理。all 要求同一路径匹配全部给定值，包含数组、关系和 blocks 的全部合法分支；非法值或不可查询分支明确拒绝。

point 仍为经纬度二元组。near 输入为 [longitude,latitude,maxMeters|null,minMeters|null]，距离使用 WGS84 椭球最短测地线，单位米；至少一个距离边界且 min<=max，边界包含。within/intersects 接受 GeoJSON 几何对象；经纬度、闭合环和节点预算在查询编译前验证。点在外环内且不在洞内部命中，within 排除边界，intersects 包含边界。全部运算在 PostgreSQL 内执行，列表与 total 共用权限和谓词，不将查询转为内存全表过滤。

列表 URL 统一使用 where JSON AST、sort JSON 数组和 columns JSON 数组。筛选器可递归组织 AND/OR 分组，按字段类型提供适用运算符；无效输入阻止请求且保留编辑值。排序支持多个字段和优先级。集合元数据提供必需的 defaultSort 和字段 sortable；只公开可读、可查询且不在重复容器中的可排序字段，配置项全部被隐藏时回退 updatedAt 降序。界面消费实际默认排序，不按字段顺序猜测；near 覆盖显式字段排序，按未包裹日期线的经纬度平面距离升序，最后一个 near 条件决定排序。重复容器只对实际命中距离范围的点取最小距离；关联路径在目标读取策略、字段可查询策略与语言上下文内计算排序，不泄露被拒绝目标的位置。旧 filterField/filterValue 及单值 sort/order 在本次界面切换后删除，不设置长期双轨解析。

## 持久化预设

可信行策略始终使用当前语言在集合配置中的默认 fallback；客户端 fallback 只控制用户查询和返回正文的表示，不改变授权所依据的数据。可信上下文重建当前及递归关系目标的默认语言回退，并隔离与用户查询不同的索引别名，避免用户先建立无回退索引缓存后影响策略。list 的 rows/total、get、关系条件及展开使用同一授权规则。

content_query_presets 归 content 所有；保存 collection_id、owner_id、name、access、query、version 和时间。query 只含 where、sort、columns、q 和可选 groupBy，不包含文档正文、凭据、locale 或权限结果。输入字段与排序按当前可查询字段重新校验，columns 按当前可读元数据投影，应用预设时仍由文档读取执行完整权限。

queryPresets.list/create/update/share/delete、preview 和 fieldOptions 均为 collection scope。三项访问规则、参数字段、候选校验、签名、引用、角色权限与版本控制见 [预设参数与查询上下文](collections-preset-access.md)。预设参数当前按全局对象保存，不接受 localized 字段。操作 locale 控制策略、元数据及查询资格，查询本身不绑定语言。

每个集合的预设数量由 maxQueryPresets 策略注入；元数据在同一 SQL 快照内有界读取，按当前规则和字段资格筛选后分页，total 和 rows 使用同一资格。sort/columns 输入以 maxQueryNodes/maxFields 为限，DTO 与列表 URL 保留已公布的合法配置。此过程不读取文档正文或在内存过滤文档。预设 ID 不授予文档权限。

## WGS84 数值与依赖

本地 Payload `packages/drizzle/src/queries/parseParams.ts` 的 near 过滤调用 `ST_DWithin(column::geography,point::geography,max)` 和 `ST_Distance(...::geography)>=min`；未传 use_spheroid，因此使用 [PostGIS 默认椭球](https://postgis.net/docs/manual-dev/en/ST_DWithin.html)。同一分支将排序改为 geometry `<->`，`buildQuery.ts` 与 `buildOrderBy.ts` 消费 rawSort，因此过滤距离与排序距离分别实现。

0016_wgs84_distance.sql 提供 SECURITY INVOKER、IMMUTABLE、STRICT、PARALLEL SAFE 的四 float8 参数函数。基于 [Karney 测地线辅助球参数化](https://arxiv.org/abs/1109.4448)，将输入规范到相对经度 [0,π]、绝对纬度递减且起点在南半球；以正东方位为零的偏角在 [-π/2,π/2] 上最多一百二十八次二分，机器浮点区间不再收缩时退出，距离与经度修正分别用十六点 Gauss-Legendre 积分。偏角参数保留近赤道测地线的极小方位余弦，纬度平方差按离极点距离选用正弦或余弦乘积，避免相近数相减消失。WGS84 长半轴 6378137 米、扁率 1/298.257223563 是几何定义；没有 Vincenty 不收敛后球面降级路径。单次调用最多 2048 个积分采样，所有循环上界固定，不新增数据库扩展、运行时库、查询后筛选或超时配置。

距离绝对误差契约为 0.0001 米。纬度角绝对值总和小于 (1-f)×2^-52 弧度时按赤道规范化，以避免亚浮点尺度下平方的下溢；由最大子午曲率半径 a/(1-f) 与三角不等式，该规范化引入的绝对距离误差最多 a×2^-52 米，约 1.42 纳米。此舍入界来自 IEEE float8 精度，不随测试向量调整。

持久化测试向量由独立 GeographicLib Python 2.1 的 `Geodesic.WGS84.Inverse(lat1,lon1,lat2,lon2)['s12']` 生成，含十六个边界与四十八个 seed=2410 的全球随机样本，并双向测试；另有八个近赤道临界回归，含不对称纬度、π×(1-f) 转折及 1e-100/1e-250 度纬度。边界含同点、东西及南北、亚毫米、同极点、南北极、日期变更线、对跖与近对跖。数值回归使用独立期望，不用被测函数生成答案。真实 PostgreSQL 在既有五秒 statement_timeout 内对 2048 点聚合验证误差，不上调 SQL 或请求预算。实现核验另以 seed=2411 的 4096 个独立点覆盖 2048 个全球随机点及各 512 个近极、同经度、近对跖和赤道转折输入，最大绝对误差 1.12e-8 米；此实验日志不替代常驻回归或误差契约。

迁移撤销 PUBLIC 对该函数的全部权限，运行账号仅显式获得该精确签名的 EXECUTE，无 grant option。授权检查拒绝缺失函数、签名漂移、易变性/严格性/并行属性漂移、SECURITY DEFINER、PUBLIC EXECUTE 与运行账号 grant option；readiness 同时要求迁移账本和可调用安全函数。此函数无 Drizzle 表对象，物理表结构仍由现有 Drizzle 检查逐列核对；迁移账本与真实函数行为由数据库测试验证。

## 切换、观测与回滚

0013_query_presets.sql 创建预设表和索引，0016_wgs84_distance.sql 提供距离函数和最小调用权限；0024_query_preset_access.sql 将共享规则改为 access 并维护参数引用索引，不修改历史迁移。停止旧 writer 后迁移、授权、reconcile 操作目录，再统一切换 API、SDK 和管理端。0024 的核验及回滚遵循 [预设参数与查询上下文](collections-preset-access.md)，不能直接启动仍写 shared 列的旧产物。距离函数通过 migration ready、精确权限及 near 边界回归核验，回滚不自动删除已有数据与函数。

## 验证

公开接口测试使用真实 PostgreSQL 验证集合运算、文字与地理边界、权限与 total、预设私有/共享隔离、CAS、幂等、审计回滚和撤权。组件测试验证多条件编辑、分组、排序优先级、预设保存应用和失败反馈。最终结果以实际测试日志和统一四门为准，不以契约文本代替通过证据。
