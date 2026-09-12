# 深圳 50 处广为人知对象清单

2026-09-12。机器可读源是 [`data/landmarks/shenzhen-top50.json`](../../data/landmarks/shenzhen-top50.json)。本文给人和并行 Agent 看。

正在使用 [实景建模 Skill](../../skills/landmark-reconstruction/SKILL.md)。这不是官方排名，也不是 50 栋都已开建。现有 16 项精修队列仍以 [制作路线图](shenzhen-landmark-roadmap.md) 为准；本清单把公园、片区和地图外著名对象补进同一选题表，方便按 workflow 分派。

当前游戏裁切 `WGS84 [113.915,22.497,114.135,22.575]`。`city.json` 已具名 10 处：春笋、腾讯、平安、市民中心、京基100、地王、深圳湾公园、人才公园、莲花山、香蜜湖。地图外对象先做扩区判断，不能塞进错误位置。

## 和其他对话怎么拆

| 对话 | 只写 |
| --- | --- |
| 本对话「深圳 50 地标清单」 | 本清单、参考图脚本、春笋 / 平安照片包 |
| [Tencent Binhai building upgrade](762c25ab-f5a8-41d4-b0c2-af73ecb69b71) | 腾讯外观候选目录 |
| [Fortune Plaza documentation review](60e3905f-cd53-4895-b99d-548c3db349ab) | 财富广场证据 |
| [Cursor candidate export project](b5a12ef2-cc8b-4800-b466-407a4ab1f751) | 单对象预览工具 |

不要改 `scripts/landmarks/tencent.py`、`priority.py`、共享 `src/` 或 `public/city` 总资产。不同对象可以并行；同一对象必须资料 → 规格 → 模型串行。

## 照片规则

网页相册默认只作目视参考。真正下载进仓库工作目录的，必须是许可可核对的来源，当前试点只用 Wikimedia Commons 的 CC BY / CC BY-SA / CC0 / 公有领域。下载命令：

```sh
.venv/bin/python scripts/landmarks/fetch_reference_photos.py --place bamboo --place pingan
```

产物在 gitignore 的 `artifacts/landmark-references/<id>/`。换机器可按 catalog 里的 `commonsFiles` 重跑。这些图用于轮廓、材料分区和光线观察，不直接当立面贴图。春笋 / 平安已看图的结论见 [试点观察](reference-observations-pilot.md)。

## 50 处

### 天际线与塔楼

| # | id | 名称 | 覆盖 | 下一步 |
| ---: | --- | --- | --- | --- |
| 01 | tencent | 腾讯滨海大厦 | 图内 | 等另一对话交候选 |
| 02 | bamboo | 中国华润大厦「春笋」 | 图内 | 本轮参考图试点 |
| 03 | pingan | 平安金融中心 | 图内 | 本轮参考图试点 |
| 04 | civic | 深圳市民中心 | 图内 | 已有模块，后比图 |
| 05 | kk100 | 京基100 | 图内 | 参考图已看；缺街面塔身 |
| 06 | diwang | 地王大厦 | 图内 | 参考图已看；与京基轮廓可分 |
| 07 | guomao | 深圳国贸大厦 | 图内 | 先配准地块 |
| 08 | seg | 赛格广场 | 图内 | 先配准 |
| 09 | stock-exchange | 深交所营运中心 | 图内 | 参考图已看；坐标仍 unknown |
| 16 | bay-sports | 深圳湾体育中心「春茧」 | 图内 | 参考图已看；广告围挡不当屋盖 |
| 17 | bay-one | 深圳湾一号 | 图内 | 拆塔后配准 |
| 21 | hanking | 汉京中心 | 图内 | 先核与「汉国」是否同一对象 |
| 30 | shanghai-hotel | 上海宾馆 | 图内 | 先配准 |

### 中轴与公共建筑

| # | id | 名称 | 覆盖 | 下一步 |
| ---: | --- | --- | --- | --- |
| 10 | concert-hall | 深圳音乐厅 | 图内 | 先配准 |
| 11 | library-center | 深圳图书馆（中心馆） | 图内 | 先配准 |
| 12 | mocata | 当代艺术与城市规划馆 | 图内 | 先配准 |
| 13 | convention-futian | 深圳会展中心（福田） | 图内 | 不是宝安新馆 |
| 14 | book-mall | 深圳书城中心城 | 图内 | 先配准 |
| 15 | youth-palace | 深圳市少年宫 | 图内 | 先配准 |
| 27 | futian-station | 福田站 | 图内 | 地面广场与出入口 |
| 28 | guanshanyue | 关山月美术馆 | 图内 | 先配准 |
| 29 | grand-theater | 深圳大剧院 | 图内 | 先配准 |

### 用户重点与综合体

| # | id | 名称 | 覆盖 | 下一步 |
| ---: | --- | --- | --- | --- |
| 18 | mixc-world | 万象天地 | 图内 | 勿并行改 priority.py |
| 19 | fortune-plaza | 财富广场 | 图内 | 等资料对话 |
| 20 | qijie-gongguan | 七街公馆 / 哈尔滨大厦 | 图内 | 轮到模型再拆候选 |
| 22 | coco-park | COCO Park | 图内 | 先配准 |
| 23 | mixc-luohu | 万象城（罗湖） | 图内 | 勿与万象天地混 |
| 24 | coastal-city | 海岸城 | 图内 | 先配准 |
| 25 | oct-harbour | 欢乐海岸 | 图内 | 先配准 |
| 26 | window-world | 世界之窗 | 图内 | 缩微景观不当真城 |

### 片区

| # | id | 名称 | 覆盖 | 下一步 |
| ---: | --- | --- | --- | --- |
| 31 | tech-park | 科技园 | 图内 | 拆街段 |
| 32 | huaqiangbei | 华强北 | 图内 | 拆街段 |
| 33 | dongmen | 东门老街 | 图内 | 先配准 |
| 34 | futian-axis | 福田中心区中轴线 | 图内 | 建筑拆独立 id |
| 35 | houhai | 后海 / 深超总 | 图内 | 拆街段 |
| 36 | caiwuwei | 蔡屋围 | 图内 | 拆街段 |

### 公园与山体

| # | id | 名称 | 覆盖 | 下一步 |
| ---: | --- | --- | --- | --- |
| 37 | lianhua | 莲花山公园 | 图内 | 沿用地形流程 |
| 38 | baypark | 深圳湾公园 | 图内 | 岸线 / 步道，不当楼 |
| 39 | talent | 深圳人才公园 | 图内 | 内湖与树阵 |
| 40 | xiangmi | 香蜜湖 / 香蜜公园 | 图内 | 先拆湖与公园范围 |
| 41 | lizhi | 荔枝公园 | 图内 | 先配准 |
| 42 | central-park | 深圳中心公园 | 图内 | 先配准 |
| 43 | bijia | 笔架山公园 | 图内 | 补边界来源 |
| 44 | mangrove | 福田红树林 | 图内 | 不编造码头 |

### 地图外著名对象

| # | id | 名称 | 覆盖 | 下一步 |
| ---: | --- | --- | --- | --- |
| 45 | sea-world | 海上世界明华轮 | 图外 | 先扩区 |
| 46 | design-society | 海上世界文化艺术中心 | 图外 | 先扩区 |
| 47 | airport-t3 | 宝安国际机场 T3 | 图外 | 先扩区 |
| 48 | universiade | 深圳大运中心 | 图外 | 先扩区 |
| 49 | happy-harbor | 欢乐港湾 / 湾区之光 | 图外 | 先扩区 |
| 50 | shenzhen-north | 深圳北站 | 图外 | 先扩区 |

未列入但同样有名、需要时再开一条：前海石、梧桐山、仙湖植物园、大梅沙、南头古城、大鹏所城、盐田港。

## 选题依据（不是尺寸证明）

- [深圳：将城市品质镌刻进每一座建筑](https://www.sz.gov.cn/cn/xxgk/zfxxgj/zwdt/content/post_12162544.html)
- [在建筑中阅读城市精神](https://www.sz.gov.cn/cn/xxgk/zfxxgj/zwdt/content/post_12080423.html)
- [地王大厦专题](https://www.sz.gov.cn/szstory/202302/content/post_10421146.html)
- [京基100 政府页](https://www.sz.gov.cn/szzt2010/yhyshj/zdyq/lhq/content/post_12428213.html)
- 城管局市政公园页：莲花山、深圳湾、人才、香蜜、中心、荔枝
- 南方+ 人气地标候选，只作交叉，不作名录

## 跑通一两个之后怎么派多 Agent

见 [top50 参考图工作包](handoffs/top50-reference-pack.md)。原则：一次一个 id、独立候选目录、先照片后规格再灰模。下一波建议在腾讯候选接入后，按 `kk100`、`diwang`、`stock-exchange`、`bay-sports` 各派一个资料 Agent。
