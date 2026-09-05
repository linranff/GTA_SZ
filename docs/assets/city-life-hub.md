# 湾畔生活驿站 · Blender 生活节点

这是原创、虚构的深圳城市生活场景，为日结配送、城市巡检与休息补给提供可见地点。它不是某座现存店铺的测绘复刻，也不代表整个城市已经达到该节点的近景完成度。

交付包含真实几何的门框、门把手、玻璃、服务窗口、浅进深店内货架与商品、咖啡机、热饭托盘、外卖取货架及纸袋、长椅、公告牌、价目牌、花箱、雨棚梁柱、檐沟及排水管、屋顶设备与两辆电动车。所有外观素材为本项目生成；中文招牌用本机字体栅格化，未再分发字体文件。

| 资产 | 用途 |
| --- | --- |
| `public/city/life-hub.glb` | 浏览器使用的模型；23,222 三角面，27 个材质子网格，1,947,576 字节 |
| `public/city/life-hub.json` | 实际导出范围、交互点和资产说明 |
| `public/city/life-hub/signs.png` | 原创 2048 × 2048 招牌图集，已内嵌于 GLB |
| `public/city/life-hub/signs-emissive.png` | 仅文字与局部标识发光的遮罩，已内嵌于 GLB |
| `public/city/life-hub/artwork.json` | 图集排版区域 |
| `src/city-life-hub.ts` | 共享模型容器加载、按站点克隆、玻璃材质、局部照明和交互坐标 |
| `scripts/build_city_life_hub.py` | 可重现的图集与 Blender 增量构建入口 |

构建命令为 `.venv/bin/python scripts/build_city_life_hub.py`，使用本机 `/Applications/Blender.app/Contents/MacOS/Blender`。脚本只导入共享 `city_mesh.py` 的网格构造 API，输出生活驿站；不重建或覆盖道路、基础城市、车辆及重点地标。原生 Blender 文件位于本机 `artifacts/city/life-hub/life-hub.blend`，资产复核图位于 `artifacts/city/life-hub/asset-review.png`。这些工作文件遵循项目既有忽略规则。

模型局部 X 沿店面，Z 指向后院，正门朝 −Z。GLB 加载保持现有的根节点方向修正规则。完整几何范围为 X=[−6.525, 7.01324]、Z=[−5.05, 4.79]，最高 4.335；包含植物叶尖、电动车和前庭。站点占地应至少按 14.1 × 10.2 游戏米验证，不能只按 12 × 6 米店面体量排除车道。

`createCityLifeHub(scene, {x, z, heading, height, id?})` 接受已经完成道路、水体和建筑排除的站点，heading 为 Babylon `rotation.y`。返回的 `meshes` 可加入集成人员维护的反射和阴影列表；`interactions.entry`、`interactions.delivery`、`interactions.rest` 已转换为世界坐标。局部交互点依次是 (0,−4.35)、(3.95,−4.45)、(−3.65,−3.3)。具体任务名称与结算逻辑不写入模型。

`setMode('day'|'sunset'|'night')` 控制招牌及灯具的发光程度。一个暖色局部灯只照射驿站本身，不改变全城和玩家车辆的灯光选取。玻璃保留 IBL 与透明度，使用与当前车窗相同的材质热切换保护。纹理只加载一次，三个站点共享原始容器；实例材料独立，以免一处模式切换修改另一处。

2026-09-06 已完成两次 Blender 资产图复核：第二次把主招牌移至雨棚上沿，解决深雨棚遮挡店名的问题。核查了导出三角面、材质子网格和实际坐标范围。该离线渲染只验证本资产；城市场景中的放置、阴影及交互验收由主集成流程完成，没有据此宣称整城画质或帧率。
