"""Import decoded facades and write an isolated CombatLab map. Does not reload the city."""
import json
import os
import unreal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
SOURCE = os.path.join(ROOT, 'artifacts/ue5-import/facades.glb')
MANIFEST = os.path.join(ROOT, 'ue5/Shenchengji/Content/City/imported-assets.json')

imported = []
if os.path.isfile(SOURCE):
    task = unreal.AssetImportTask()
    task.filename = SOURCE
    task.destination_path = '/Game/Imported/Facades'
    task.automated = True
    task.save = True
    task.replace_existing = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported = [{'source': 'facades.glb', 'asset': str(path)} for path in list(task.imported_object_paths)]
    unreal.log('Imported %d facade assets' % len(imported))
else:
    unreal.log_warning('Missing %s' % SOURCE)

if os.path.isfile(MANIFEST):
    payload = json.load(open(MANIFEST, encoding='utf-8'))
else:
    payload = {'version': 2, 'imported': []}
existing = [item for item in payload.get('imported', []) if item.get('source') != 'facades.glb']
payload['imported'] = existing + imported
payload['note'] = 'Interchange import after meshopt decode. Babylon files stay in public/city.'
with open(MANIFEST, 'w', encoding='utf-8') as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)

try:
    level_editor = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    level_editor.new_level('/Game/Maps/CombatLab')
    unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 4000), unreal.Rotator(0, -40, 20))  # (roll, pitch, yaw)
    unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(0, 0, 120), unreal.Rotator(0, 0, 0))
    world = unreal.EditorLevelLibrary.get_editor_world()
    settings = world.get_world_settings()
    mode = unreal.load_class(None, '/Script/Shenchengji.ShenchengjiCombatLabGameMode')
    if mode:
        settings.set_editor_property('default_game_mode', mode)
    level_editor.save_current_level()
    unreal.log('Wrote /Game/Maps/CombatLab')
except Exception as exc:
    unreal.log_warning('CombatLab map skipped: %s' % exc)
