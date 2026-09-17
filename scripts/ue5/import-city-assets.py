"""Import decoded city GLBs into /Game/Imported. Source of truth remains public/city."""
import json
import os
import unreal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
DECODED = os.path.join(ROOT, 'artifacts/ue5-import')
PUBLIC = os.path.join(ROOT, 'public/city')
LAYOUT = os.path.join(ROOT, 'ue5/Shenchengji/Content/City/mesh-layout.json')

SOURCES = [
    (os.path.join(PUBLIC, 'life-hub.glb'), '/Game/Imported/LifeHub'),
    (os.path.join(PUBLIC, 'car.glb'), '/Game/Imported/Car'),
    (os.path.join(DECODED, 'terrain.glb'), '/Game/Imported/Terrain'),
    (os.path.join(DECODED, 'landmarks.glb'), '/Game/Imported/Landmarks'),
    (os.path.join(DECODED, 'landmark-detail.glb'), '/Game/Imported/LandmarkDetail'),
    (os.path.join(DECODED, 'roads.glb'), '/Game/Imported/Roads'),
    (os.path.join(DECODED, 'buildings.glb'), '/Game/Imported/Buildings'),
    (os.path.join(DECODED, 'facades.glb'), '/Game/Imported/Facades'),
]


def make_task(source, destination):
    task = unreal.AssetImportTask()
    task.filename = source
    task.destination_path = destination
    task.automated = True
    task.save = True
    task.replace_existing = True
    return task


asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
imported = []
for source, destination in SOURCES:
    if not os.path.isfile(source):
        unreal.log_warning('Missing %s' % source)
        continue
    unreal.log('Importing %s -> %s' % (source, destination))
    task = make_task(source, destination)
    asset_tools.import_asset_tasks([task])
    for path in list(task.imported_object_paths):
        imported.append({'source': os.path.basename(source), 'asset': str(path)})

manifest = os.path.join(ROOT, 'ue5/Shenchengji/Content/City/imported-assets.json')
payload = {
    'version': 2,
    'imported': imported,
    'layout': os.path.exists(LAYOUT),
    'note': 'Interchange import after meshopt decode. Babylon files stay in public/city.',
}
with open(manifest, 'w', encoding='utf-8') as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
unreal.log('Imported %d city assets' % len(imported))

try:
    level_editor = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    map_path = '/Game/Maps/ShenzhenCity'
    level_editor.new_level(map_path)
    hub = {'x': -2721.0, 'z': -876.0, 'yaw': 0.0}
    if os.path.isfile(os.path.join(ROOT, 'ue5/Shenchengji/Content/City/city-skeleton.json')):
        with open(os.path.join(ROOT, 'ue5/Shenchengji/Content/City/city-skeleton.json'), encoding='utf-8') as handle:
            skeleton = json.load(handle)
            place = skeleton.get('places', {}).get('hub', {})
            hub['x'] = float(place.get('x', hub['x']))
            hub['z'] = float(place.get('z', hub['z']))
            hub['yaw'] = float(place.get('yaw', 0.0))
    location = unreal.Vector(hub['x'] * 100.0, hub['z'] * 100.0, 200.0)
    yaw = 90.0 - (hub['yaw'] * 57.2957795)
    unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 80000), unreal.Rotator(0, -35, 40))  # (roll, pitch, yaw): sun 35 deg up, not pointing at the sky
    unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PlayerStart, location, unreal.Rotator(0, 0, yaw))
    level_editor.save_current_level()
    unreal.log('Wrote %s at hub %s' % (map_path, location))
except Exception as exc:
    unreal.log_warning('Map create skipped: %s' % exc)
