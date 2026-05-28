import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector


CLIP_NAME = "Dragon_Ancient_Idle"

VARIANTS = [
    ("yup_negz_y_x_pre", "-Z", "Y", "Y", "X", True, False),
    ("yup_negz_negy_x_pre", "-Z", "Y", "-Y", "X", True, False),
    ("yup_negz_x_y_pre", "-Z", "Y", "X", "Y", True, False),
    ("yup_z_y_x_pre", "Z", "Y", "Y", "X", True, False),
    ("zup_negy_y_x_pre", "-Y", "Z", "Y", "X", True, False),
    ("zup_y_y_x_pre", "Y", "Z", "Y", "X", True, False),
    ("zup_negz_y_x_pre", "-Z", "Z", "Y", "X", True, False),
    ("xup_z_y_x_pre", "Z", "X", "Y", "X", True, False),
    ("yup_negz_y_x_auto", "-Z", "Y", "Y", "X", True, True),
    ("zup_negy_y_x_auto", "-Y", "Z", "Y", "X", True, True),
    ("yup_negz_y_x_no_pre", "-Z", "Y", "Y", "X", False, False),
    ("zup_negy_y_x_no_pre", "-Y", "Z", "Y", "X", False, False),
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in (
        bpy.data.actions,
        bpy.data.armatures,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
    ):
        for item in list(collection):
            collection.remove(item)


def import_variant(path, variant):
    name, forward, up, primary, secondary, prepost, auto_bones = variant
    bpy.ops.import_scene.fbx(
        filepath=str(path),
        use_manual_orientation=True,
        axis_forward=forward,
        axis_up=up,
        use_anim=True,
        ignore_leaf_bones=True,
        force_connect_children=False,
        automatic_bone_orientation=auto_bones,
        primary_bone_axis=primary,
        secondary_bone_axis=secondary,
        use_prepost_rot=prepost,
        use_image_search=True,
    )
    return name


def apply_clip_actions():
    applied = []
    frame_start = None
    for obj in bpy.context.scene.objects:
        prefix = f"{obj.name}|{CLIP_NAME}|"
        action = next((item for item in bpy.data.actions if item.name.startswith(prefix)), None)
        if not action:
            continue
        obj.animation_data_create()
        obj.animation_data.action = action
        applied.append(action.name)
        frame_start = action.frame_range[0] if frame_start is None else min(frame_start, action.frame_range[0])
    if not applied:
        idle_actions = [action.name for action in bpy.data.actions if CLIP_NAME in action.name]
        raise RuntimeError(f"Clip actions not found. Found: {idle_actions}")
    bpy.context.scene.frame_set(int((frame_start or 0) + 12))
    bpy.context.view_layer.update()
    print(f"applied {CLIP_NAME}: {applied}")


def fit_camera():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj_eval = obj.evaluated_get(depsgraph)
        for corner in obj_eval.bound_box:
            points.append(obj_eval.matrix_world @ Vector(corner))
    if not points:
        return
    min_v = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    max_v = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (min_v + max_v) * 0.5
    size = max((max_v - min_v).length, 1.0)

    cam_data = bpy.data.cameras.new("Camera")
    camera = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((0, -size * 1.8, size * 0.55))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 55
    bpy.context.scene.camera = camera

    light_data = bpy.data.lights.new("Key", "AREA")
    light = bpy.data.objects.new("Key", light_data)
    bpy.context.collection.objects.link(light)
    light.location = center + Vector((-size, -size, size))
    light_data.energy = 450
    light_data.size = size


def render(path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 540
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("World") if not scene.world else scene.world
    scene.world.color = (1, 1, 1)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for variant in VARIANTS:
        clear_scene()
        name = import_variant(input_path, variant)
        apply_clip_actions()
        fit_camera()
        output_path = output_dir / f"{name}.png"
        render(output_path)
        print(output_path)


if __name__ == "__main__":
    main()
