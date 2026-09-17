"""Load ShenzhenCity, count imported meshes, shoot the hub for visual proof."""
import json
import os
import unreal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
LAYOUT = os.path.join(ROOT, 'ue5/Shenchengji/Content/City/mesh-layout.json')
SKELETON = os.path.join(ROOT, 'ue5/Shenchengji/Content/City/city-skeleton.json')
OUT = os.path.join(ROOT, 'ue5/Shenchengji/Content/City/runtime-verify.json')
SHOT = os.path.join(ROOT, 'ue5/Shenchengji/Saved/Screenshots/hub-verify.png')


def mesh_extent(path):
    asset = unreal.EditorAssetLibrary.load_asset(path)
    if not asset:
        return None
    bounds = asset.get_bounds()
    return {
        'origin': [bounds.origin.x, bounds.origin.y, bounds.origin.z],
        'extent': [bounds.box_extent.x, bounds.box_extent.y, bounds.box_extent.z],
        'radius': bounds.sphere_radius,
    }


level_editor = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
level_editor.load_level('/Game/Maps/ShenzhenCity')

layout = json.load(open(LAYOUT, encoding='utf-8'))
skeleton = json.load(open(SKELETON, encoding='utf-8'))
hub = skeleton['places']['hub']

samples = []
loaded = 0
missing = []
for group in layout['groups']:
    dest = group['destination']
    group_loaded = 0
    for item in group['meshes']:
        path = '%s/%s.%s' % (dest, item['name'], item['name'])
        if unreal.EditorAssetLibrary.does_asset_exist(path):
            loaded += 1
            group_loaded += 1
            if len(samples) < 6:
                samples.append({'path': path, 'layout': item, 'bounds': mesh_extent(path)})
        else:
            if len(missing) < 20:
                missing.append(path)
    unreal.log('%s loaded %d / %d' % (group['id'], group_loaded, len(group['meshes'])))

city_class = unreal.load_class(None, '/Script/Shenchengji.ShenchengjiImportedCityActor')
spawned = 0
if city_class:
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(city_class, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    if actor:
        spawned = actor.build_from_layout()
        unreal.log('spawned imported city %d' % spawned)

cam = unreal.Vector(hub['x'] * 100.0, hub['z'] * 100.0, 1200.0)
unreal.EditorLevelLibrary.set_level_viewport_camera_info(cam, unreal.Rotator(0.0, -18.0, 35.0))  # (roll, pitch, yaw)
os.makedirs(os.path.dirname(SHOT), exist_ok=True)
unreal.AutomationLibrary.take_high_res_screenshot(1920, 1080, SHOT)

report = {
    'map': '/Game/Maps/ShenzhenCity',
    'hub': hub,
    'loadedMeshes': loaded,
    'layoutMeshes': sum(len(group['meshes']) for group in layout['groups']),
    'missingSample': missing,
    'samples': samples,
    'screenshot': SHOT,
    'spawnedComponents': spawned,
}
with open(OUT, 'w', encoding='utf-8') as handle:
    json.dump(report, handle, ensure_ascii=False, indent=2)
unreal.log('verify %s' % json.dumps({'loaded': loaded, 'missing': len(missing), 'shot': SHOT}, ensure_ascii=False))
