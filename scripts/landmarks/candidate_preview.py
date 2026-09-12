"""Blender-only six-view preview for an already-built landmark candidate.

Do not import this module from the game runtime, city_mesh consumers, or
scripts/build_landmark_details.py. The host launches it only inside a dedicated
Blender subprocess after candidate meshes exist and the GLB has been exported.

Creates cameras and lights in memory. Does not write public assets, does not
edit source material files, and does not add ground or preview rigs to the GLB.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

VIEWS = ("front", "back", "left", "right", "top", "street_three_quarter")
RESOLUTION = (1280, 960)
SAMPLES = 16
ENGINE = "CYCLES"
TOP_PADDING = 1.32


def top_ortho_scale(size_x, size_y, resolution=RESOLUTION, padding=TOP_PADDING, sensor_fit="HORIZONTAL"):
    aspect = resolution[0] / resolution[1]
    if sensor_fit == "HORIZONTAL":
        return max(size_x, size_y * aspect) * padding
    return max(size_y, size_x / aspect) * padding


def top_ortho_extents(ortho_scale, resolution=RESOLUTION, sensor_fit="HORIZONTAL"):
    aspect = resolution[0] / resolution[1]
    if sensor_fit == "HORIZONTAL":
        return ortho_scale, ortho_scale / aspect
    return ortho_scale * aspect, ortho_scale


def world_bounds(objects):
    points = []
    for ob in objects:
        if ob.type != "MESH" or not ob.data or not ob.data.vertices:
            continue
        for corner in ob.bound_box:
            points.append(ob.matrix_world @ Vector(corner))
    if not points:
        raise ValueError("no mesh bounds for preview cameras")
    xs, ys, zs = zip(*[(p.x, p.y, p.z) for p in points])
    minimum = Vector((min(xs), min(ys), min(zs)))
    maximum = Vector((max(xs), max(ys), max(zs)))
    return minimum, maximum, (minimum + maximum) * 0.5, maximum - minimum


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def view_distance(name, size, lens=50.0, sensor=36.0, padding=1.36):
    aspect = RESOLUTION[0] / RESOLUTION[1]
    if name in ("front", "back"):
        horiz, vert = size.x, size.z
    elif name in ("left", "right"):
        horiz, vert = size.y, size.z
    elif name == "top":
        horiz, vert = size.x, size.y
    else:
        horiz, vert = max(size.x, size.y) * 1.05, size.z * 0.52
    hfov = 2.0 * math.atan((sensor * 0.5) / lens)
    vfov = 2.0 * math.atan((sensor * 0.5 / aspect) / lens)
    return max(
        (horiz * padding * 0.5) / math.tan(hfov * 0.5),
        (vert * padding * 0.5) / math.tan(vfov * 0.5),
    )


def camera_location(name, center, size, distance, maximum):
    if name == "front":
        return Vector((center.x, center.y - distance, center.z))
    if name == "back":
        return Vector((center.x, center.y + distance, center.z))
    if name == "left":
        return Vector((center.x - distance, center.y, center.z))
    if name == "right":
        return Vector((center.x + distance, center.y, center.z))
    if name == "top":
        return Vector((center.x, center.y, maximum.z + max(size.x, size.y)))
    southwest = Vector((-1.0, -1.0, 0.0)).normalized()
    street_height = max(2.0, size.z * 0.035)
    return Vector((
        center.x + southwest.x * distance,
        center.y + southwest.y * distance,
        street_height,
    ))


def camera_target(name, center, size, minimum):
    if name == "street_three_quarter":
        return Vector((center.x, center.y, minimum.z + size.z * 0.28))
    if name == "top":
        return Vector((center.x, center.y, minimum.z))
    return Vector((center.x, center.y, center.z))


def clay_material():
    name = "candidate_preview_clay"
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    principled = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = (0.62, 0.62, 0.62, 1.0)
    principled.inputs["Roughness"].default_value = 0.86
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Emission Strength"].default_value = 0.0
    if "Specular IOR Level" in principled.inputs:
        principled.inputs["Specular IOR Level"].default_value = 0.18
    return mat


def configure_world(scene):
    world = bpy.data.worlds.get("candidate_preview_world") or bpy.data.worlds.new("candidate_preview_world")
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs["Color"].default_value = (0.46, 0.47, 0.48, 1.0)
    background.inputs["Strength"].default_value = 0.72
    scene.world = world
    return {
        "name": world.name,
        "color": list(background.inputs["Color"].default_value),
        "strength": background.inputs["Strength"].default_value,
    }


def configure_render(scene):
    scene.render.engine = ENGINE
    scene.render.resolution_x = RESOLUTION[0]
    scene.render.resolution_y = RESOLUTION[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.render.use_motion_blur = False
    scene.render.dither_intensity = 0.0
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.use_fast_gi = True
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    if hasattr(scene.cycles, "max_bounces"):
        scene.cycles.max_bounces = 6
    return {
        "engine": scene.render.engine,
        "device": scene.cycles.device,
        "samples": scene.cycles.samples,
        "denoising": scene.cycles.use_denoising,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "view_transform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure,
        "gamma": scene.view_settings.gamma,
        "film_transparent": scene.render.film_transparent,
        "motion_blur": scene.render.use_motion_blur,
        "dof": False,
        "fast_gi": scene.cycles.use_fast_gi,
        "caustics": False,
        "blender_version": bpy.app.version_string,
    }


def add_sun(name, location, target, energy):
    sun = bpy.data.objects.get(name)
    if sun is None:
        light = bpy.data.lights.new(name, type="SUN")
        sun = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(sun)
    sun.data.energy = energy
    sun.data.color = (1.0, 1.0, 1.0)
    sun.data.angle = math.radians(8.0)
    sun.location = location
    aim(sun, target)
    return {
        "name": name,
        "type": "SUN",
        "location": list(sun.location),
        "rotation_euler": list(sun.rotation_euler),
        "energy": sun.data.energy,
        "color": list(sun.data.color),
        "angle_deg": 8.0,
    }


def setup_lights(center, size):
    span = max(size.x, size.y, size.z)
    key = add_sun(
        "candidate_preview_key",
        center + Vector((span * 0.85, -span * 0.55, span * 0.95)),
        center,
        2.4,
    )
    fill = add_sun(
        "candidate_preview_fill",
        center + Vector((-span * 0.75, span * 0.35, span * 0.45)),
        center,
        0.85,
    )
    rim = add_sun(
        "candidate_preview_rim",
        center + Vector((-span * 0.15, span * 0.9, span * 0.55)),
        center,
        0.45,
    )
    return [key, fill, rim]


def setup_camera(name, center, size, minimum, maximum):
    camera_name = f"candidate_preview_{name}"
    camera = bpy.data.objects.get(camera_name)
    if camera is None:
        data = bpy.data.cameras.new(camera_name)
        camera = bpy.data.objects.new(camera_name, data)
        bpy.context.collection.objects.link(camera)
    camera.data.lens = 50.0
    camera.data.sensor_width = 36.0
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.clip_start = 0.25
    camera.data.clip_end = 20000.0
    camera.data.dof.use_dof = False
    distance = view_distance(name, size, camera.data.lens, camera.data.sensor_width)
    target = camera_target(name, center, size, minimum)
    camera.location = camera_location(name, center, size, distance, maximum)
    if name == "top":
        camera.data.type = "ORTHO"
        camera.data.sensor_fit = "HORIZONTAL"
        camera.data.ortho_scale = top_ortho_scale(size.x, size.y, RESOLUTION, TOP_PADDING, "HORIZONTAL")
    else:
        camera.data.type = "PERSP"
    aim(camera, target)
    horizontal, vertical = (
        top_ortho_extents(camera.data.ortho_scale, RESOLUTION, camera.data.sensor_fit)
        if name == "top" else (None, None)
    )
    return camera, {
        "name": name,
        "type": camera.data.type,
        "location": list(camera.location),
        "target": list(target),
        "rotation_euler": list(camera.rotation_euler),
        "lens": camera.data.lens,
        "sensor_width": camera.data.sensor_width,
        "sensor_fit": camera.data.sensor_fit,
        "ortho_scale": camera.data.ortho_scale if camera.data.type == "ORTHO" else None,
        "ortho_horizontal": horizontal,
        "ortho_vertical": vertical,
        "ortho_padding": TOP_PADDING if name == "top" else None,
        "clip_start": camera.data.clip_start,
        "clip_end": camera.data.clip_end,
        "dof": False,
        "distance": distance,
    }


def render_preview(objects, output_dir):
    output_dir = Path(output_dir)
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    minimum, maximum, center, size = world_bounds(objects)
    render = configure_render(scene)
    world = configure_world(scene)
    lights = setup_lights(center, size)
    cameras = {}
    images = {"clay": {}, "material": {}}
    clay = clay_material()

    for name in VIEWS:
        camera, cameras[name] = setup_camera(name, center, size, minimum, maximum)
        scene.camera = camera
        for mode in ("clay", "material"):
            view_layer.material_override = clay if mode == "clay" else None
            view_layer.update()
            path = output_dir / "views" / mode / f"{name}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            scene.render.filepath = str(path)
            print(f"CANDIDATE_PREVIEW {mode}/{name}", flush=True)
            bpy.ops.render.render(write_still=True)
            if not path.is_file() or path.stat().st_size < 256:
                raise RuntimeError(f"preview image missing or empty: {path}")
            images[mode][name] = str(path)

    view_layer.material_override = None
    return {
        "views": list(VIEWS),
        "bounds": {"min": list(minimum), "max": list(maximum), "center": list(center), "size": list(size)},
        "render": render,
        "world": world,
        "lights": lights,
        "cameras": cameras,
        "images": images,
        "notes": [
            "Neutral studio suns and a mid-grey world; no cinematic look, bloom, or depth of field.",
            "Clay uses a view-layer material override and does not rewrite source material files.",
            "Preview cameras and lights are scene helpers only; they are created after GLB export.",
        ],
    }
