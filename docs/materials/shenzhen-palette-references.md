# 深圳建筑材质与调色参考

目标是用真实材料分工建立辨识度：浅灰白实体墙、蓝灰或青绿玻璃、裸金属与有色涂层分别处理。以下 HEX、粗糙度、金属度代理和细节尺度均为艺术近似，未经过现场校色、反射率或表面粗糙度测量。万象与京基的精确色相仍为暂定值；不得称为照片采样实测。

本轮复用此前已目视的腾讯、七街和财富原始实景，并阅读设计方、供应商、研究机构或设计方供稿；未启动 Chrome 或 GPU。所有机器可读参数在 `data/materials/shenzhen-palette.json`。

## 重点地标

| 地标 | 主色与建议角色 | 粗糙度范围 | 证据与边界 |
|---|---|---|---|
| 京基100 | 蓝灰玻璃 #809CA8；浅银灰构件 #C0C8C9 | 蓝灰玻璃 0.18–0.3；浅银灰构件 0.3–0.48 | [Farrells，设计方](https://farrells.com/project/kk100/)。色号未由设计方发布，玻璃实际镀膜和立面分区仍待核实。 |
| 平安金融中心 | 灰蓝玻璃 #8D9FA4；亚麻纹不锈钢 #C7CAC7；暖灰石材 #C5BEAF | 灰蓝玻璃 0.18–0.3；亚麻纹不锈钢 0.3–0.46；暖灰石材 0.64–0.8 | [KPF，设计方](https://www.kpf.com/project/ping-an-finance-centre)、[Outokumpu，材料供应商](https://www.outokumpu.com/en/news/2014/~/link.aspx?_id=618B28850F1F4BDDB736E5DB4109CA52&_z=z)。钢材与表面处理有供应商依据；色号、粗糙度及玻璃色相仍是艺术近似。 |
| 地王大厦 | 青绿玻璃 #659C90；暖灰土色细部 #B1A38C；浅灰绿分格 #C5CEC5 | 青绿玻璃 0.18–0.3；暖灰土色细部 0.48–0.68；浅灰绿分格 0.34–0.5 | [CVU / CTBUH，自有建筑数据库](https://www.skyscrapercenter.com/build/shun-hing-square/258)。绿色/土色有数据库文字依据；具体面板范围和材质牌号未核实。 |
| 腾讯滨海大厦 | 蓝灰玻璃 #8BA8B1；铜棕色连桥 #B98D68；浅色幕墙分格 #C3CBCB | 蓝灰玻璃 0.2–0.32；铜棕色连桥 0.38–0.55；浅色幕墙分格 0.32–0.48 | [NBBJ，设计方](https://www.nbbj.com/work/tencent-global-headquarters)、[Inhabit，幕墙顾问](https://inhabitgroup.com/project/tencent-seafront-tower-shenzhen-prc/)。黄昏实景受暖光影响；连桥铜色不能推出纯铜或固定日光色。 |
| 万象天地 / 华润置地大厦B、C、D座 | 中浅蓝灰玻璃 #97AFB4；银白细框 #C8CFCE；灰蓝凹部 #657D83 | 中浅蓝灰玻璃 0.22–0.34；银白细框 0.32–0.48；灰蓝凹部 0.36–0.5 | [Foster + Partners，设计方](https://www.fosterandpartners.com/projects/nanshan-technology-finance-city/)、[Foster + Partners，设计方](https://www.fosterandpartners.com/news/the-foster-plus-partners-office-in-shenzhen-s-high-tech-nanshan-district)、[华阳国际，项目设计方](https://www.capol.cn/projectdetail.aspx?id=100000068055563)。B/C/D高度来自未复核OSM标签；外观色号尚需日光照片校核。 |
| 中国华润大厦 / 春笋 | 冷灰玻璃 #A0B2B7；银灰竖肋 #CFD5D3；灰银三角框 #AEBDBD | 冷灰玻璃 0.18–0.3；银灰竖肋 0.3–0.46；灰银三角框 0.32–0.48 | [KPF，设计方](https://www.kpf.com/project/china-resources-tower)。玻璃与结构分工有设计方依据；具体银灰色与表面涂层是艺术解释。 |
| 七街公馆 / 哈尔滨大厦 | 浅银灰围护 #C9CECE；蓝灰窗 #829EAB；蓝灰凹槽 #596F7A；白灰细框 #DADDD9 | 浅银灰围护 0.54–0.72；蓝灰窗 0.24–0.38；蓝灰凹槽 0.36–0.52；白灰细框 0.48–0.64 | [乐有家，原实景相册](https://fang-community.leyoujia.com//pic/hsl/2018-07/17/35346e99-628d-4242-8ac9-a64f6adf9e5d.jpg)、[乐有家，原实景相册](https://fang-community.leyoujia.com//pic/hsl/2018-07/17/b6c701f6-debf-42df-a05d-1ef107f87a6d.jpg)。照片色彩未标定，围护基材不能仅凭灰白外观断定为混凝土或铝板。 |
| 财富广场 A、B 座 | 蓝玻璃 #83A8B9；银白水平带 #CDD2D0；白灰实体墙 #D3D4CF；顶格栅 #BEC7C6 | 蓝玻璃 0.16–0.28；银白水平带 0.32–0.5；白灰实体墙 0.52–0.7；顶格栅 0.3–0.48 | [乐有家，原实景相册](https://fang-community.leyoujia.com//community/album/2019-06/10/10/0bf01030-5f46-4f65-90b7-2864d64e6156.jpg)。玻璃含强天空反射，不能把实景高光直接当固有色；A/B分面材质及牌号尚未测定。 |

## 普通建筑分组

这些是材质族，不是对每栋楼的事实断言。用途标签、片区资料和照片先决定分组，密度与足印只用于辅助。无依据时保留可替换的中性默认，勿仅凭楼高或某区名称定类。

| 分组 | 主色族（sRGB） | 表面建议 | 来源和置信度 |
|---|---|---|---|
| 普通住宅：浅暖涂层/石色 | #D8D0BF / #CEC4B1 / #C8B9A4 | 墙面细颗粒，低幅竖向雨痕；窗与阳台形成局部深色，墙面保持明度 | [深圳市规划国土发展研究中心 / 城市设计促进中心](https://www.szdesigncenter.com/pxjkl)、[深圳市住房和建设局](https://zjj.sz.gov.cn/attachment/1/1396/1396655/11035379.pdf)；参数为类型艺术近似。 |
| 普通住宅：灰白瓷砖/灰白围护 | #D1D4D0 / #C0C9C8 / #D4D8D4 | 细砖缝主要放在法线/粗糙度层，避免每块砖黑边；重复窗格与局部窗帘变化，实体墙不随机发光 | [乐有家，原实景相册](https://fang-community.leyoujia.com//pic/hsl/2018-07/17/35346e99-628d-4242-8ac9-a64f6adf9e5d.jpg)、[NODE设计方供稿，有方发布](https://www.archiposition.com/items/20240411043122)；参数为类型艺术近似。 |
| 办公楼：冷灰蓝/灰青玻璃 | #8FA6AF / #97AEAD / #899CA8 | 玻璃反射随朝向变化，保持窄而浅的分格；粗糙度按大面轻微变化，不叠全楼黑噪声 | [Inhabit，幕墙顾问](https://inhabitgroup.com/project/tencent-seafront-tower-shenzhen-prc/)、[Foster + Partners，设计方](https://www.fosterandpartners.com/projects/nanshan-technology-finance-city/)、[Farrells，设计方](https://farrells.com/project/kk100/)；参数为类型艺术近似。 |
| 办公楼：暖灰实墙与窗带 | #C3C0B6 / #B6B7B0 / #CCC9C0 | 实墙占比高于全玻璃塔楼；水平窗带与实体角部区分，不使用统一住宅小窗贴图 | [KPF，设计方](https://www.kpf.com/project/ping-an-finance-centre)、[深圳市规划国土发展研究中心 / 城市设计促进中心](https://www.szdesigncenter.com/pxjkl)；参数为类型艺术近似。 |
| 城中村：灰白瓷砖/水刷石 | #D0D1C6 / #BBBEB8 / #B4B7AF / #C8C1B0 | 按楼区分瓷砖与水刷石，不按每个像素随机彩色；底层店铺允许少量低饱和蓝绿/砖红招牌，墙面仍是浅灰白；栏杆、空调和雨痕局部处理，不把城中村统一做成暗褐破败墙 | [NODE设计方供稿，有方发布](https://www.archiposition.com/items/20240411043122)、[深圳市规划国土发展研究中心 / 城市设计促进中心](https://www.szdesigncenter.com/pxjkl)；参数为类型艺术近似。 |
| 屋顶：低饱和浅中灰 | #B6BCB8 / #A8B1AD / #C6C9C2 | 区别混凝土、防水层与机房，但控制整体反差；中心区/滨海/居住区按片区协调；此处是设计方向，不声称现状统计 | [深圳市住房和建设局](https://zjj.sz.gov.cn/attachment/1/1396/1396655/11035379.pdf)；参数为类型艺术近似。 |

NODE 的南头案例明确记录白色瓷砖与灰色水刷石，支持城中村材质分组，但不能代表全深圳每个城中村。深圳屋顶导则的低饱和、高明度建议仅用于屋顶设计方向，不能当成现有墙面颜色统计。不同年代、区位和外墙材料仍需保留差异。

## 材质模块使用约定

JSON 同时提供 sRGB HEX 和已解码的线性 RGB；后者只能直接使用一次，不能再次转线性。裸金属、玻璃和有色涂层分别处理：玻璃为介电体，不能靠提高全楼金属度制造反射。当前玻璃色是远景不透明窗代理，并非玻璃吸收系数或真实透射参数。[Filament 原始材质说明](https://google.github.io/filament/main/filament.html)。

先在中性日光及固定曝光下确认楼体颜色，再在黄昏检查反射和窗光。全楼过黑时，先查环境光、底色乘法与色彩空间；墙体无需自发光。大面反差、墙窗面积比和少量连续分格优先，细缝与微污渍留给法线/粗糙度及近景，避免远景闪烁。每栋楼固定材质族，颜色变化集中在同族窄范围，夜窗按房间或连续楼层组织。这些是本项目艺术建议。

公开照片只作参考；本交付不包含照片文件或照片贴图许可。
