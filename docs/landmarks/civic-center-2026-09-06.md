# 市民中心外观重建与摄影晚霞恢复

本轮撤销生成的红霞全景，恢复用户第三张图所选的 Belfast 摄影云层中间版：原始 HDR、方向性橙色晚霞与深色云底、天空显示单独压高光，玻璃和水面继续使用 HDR 反射。源文件与历史状态见 `data/materials/cinematic-environment.json`。

市民中心替换原来的两座红圆柱和简单 U 形屋顶，交付内容为蓝色翼状屋盖、西黄圆塔、东红方塔、五层玻璃裙楼、中庭洞口、分叉钢柱、玻璃台基和中央铺装。屋盖下两条服务道路保留通行。夜晚点亮银白檐口和暖白屋底，蓝色顶面与红黄塔身保留独立材质。

## 来源与尺度

- 用户图一从北向南，红塔在左、黄塔在右；图二从南向北，左右相反。参考图片仅用于形状与颜色，不作为游戏贴图分发；文件名与哈希记录在 `data/landmarks/civic.json`。
- [中建二局施工记录](https://2bur.cscec.com/xwzx6/qykw6/201810/P020181022582902814473.pdf)支持屋盖跨度486米与最高84.7米。[深圳市地名志](https://pnr.sz.gov.cn/attachment/1/1285/1285348/10537364.pdf)支持五层裙楼、红黄两塔等主体信息。
- OSM 轮廓取自项目已有福田数据：黄塔 `way/616988599`、红塔 `way/616988601`、东西裙楼 `relation/10837976` / `relation/10837977`，以及分段屋盖。未采信与主来源冲突的 OSM 91.5米标签。
- 轮廓整体归一到约486×154米；其中154米是二手来源交叉支持的值。屋顶截面、塔顶斜面、檐口厚度、立面与台基细部为照片拟合。水平与垂直均只缩放0.60一次。
- [LiteMagic照明案例](https://litemagic.com/en/Case/casepage.aspx?id=100000073374632)支持2700K暖白洗墙、树状柱与翼底泛光；当前游戏通过专用檐口灯材质与屋底补光近似这些效果。

## 可重建入口

```sh
.venv/bin/python scripts/prepare_civic_center.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build_landmark_details.py
node scripts/optimize_landmark_details.mjs
node scripts/finalize_city_assets.mjs
.venv/bin/python scripts/validate_landmark_details.py
node scripts/inspect_landmark_details.mjs
npm run build
node scripts/check-civic-center.mjs
```

第一步需要本机原始 OSM 提取文件；仓库内的 `civic.json` 已包含本次重建所用轮廓与三角面，可以直接从 Blender 构建步骤复现。Blender 源工程位于本机 `artifacts/city/landmark-details.blend`。增量 GLB 替换 `landmark_civic_`，不重建道路、车辆或普通城市楼体。

## 本次验证与边界

当前增量包SHA256：`c5778c4b4ec9c24917d75d32e3a55999a400676e2076f3860c485dbbc6c6db22`。市民中心106,640三角形、14个材质网格；包含所有地标的压缩包2,163,100字节。按用户本轮先完成画面的要求保留曲面与钢结构，未宣称帧率达标。

73项集成测试通过；第二次资产修订后5项地标/晚霞相关测试通过。最终资产通过几何、来源哈希和到达点验证，服务道路距实体的间隔也超过车道宽度及碰撞余量。最后的接缝清理仅移除视觉细线，未改变碰撞数据。

游戏截图与加载/移动记录在 `output/playwright/civic-center/`，报告绑定当前GLB哈希；覆盖北侧白天、南侧白天、俯瞰、晚霞、两侧夜景、地图到达及驶离。截图需按具名角度复核，构建成功本身不代表外观验收。

主集成人员与独立复核 Agent 已查看最终 `day-north`、`day-aerial`、`night-south`：方向、翼状曲线、开口与主体颜色通过，未发现阻断交付的穿插、漂浮或堵路。屋顶镜面高光和檐底洗墙渐变仍有精修空间。

这次完成建筑主体外观，尚非竣工图级复原；周边完整市政广场、水池、绿化与内部空间未作为本次完成项。
