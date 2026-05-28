import argparse
from pathlib import Path
import sys

import bpy


VARIANTS = {
    "preserve-no-prepost": {
        "use_prepost_rot": False,
        "automatic_bone_orientation": False,
        "description": "Preserve bone axes, ignore FBX pre/post rotations",
    },
    "preserve-prepost": {
        "use_prepost_rot": True,
        "automatic_bone_orientation": False,
        "description": "Preserve bone axes, apply FBX pre/post rotations",
    },
    "auto-bone-orientation": {
        "use_prepost_rot": True,
        "automatic_bone_orientation": True,
        "description": "Let Blender repair bone orientation",
    },
    "idle-pose-as-rest-prepost": {
        "use_prepost_rot": True,
        "automatic_bone_orientation": False,
        "pose_as_rest_action": "NPC Root [Root]|Dragon_Ancient_Idle|Base Layer",
        "description": "Apply first Idle frame as armature rest pose",
    },
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in (
        bpy.data.actions,
        bpy.data.armatures,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.textures,
    ):
        for item in list(collection):
            collection.remove(item)


def import_fbx(path, settings):
    bpy.ops.import_scene.fbx(
        filepath=str(path),
        use_manual_orientation=True,
        axis_forward="-Z",
        axis_up="Y",
        use_anim=True,
        ignore_leaf_bones=True,
        force_connect_children=False,
        automatic_bone_orientation=settings["automatic_bone_orientation"],
        use_prepost_rot=settings["use_prepost_rot"],
        use_image_search=True,
    )


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=False,
        export_frame_range=False,
        export_skins=True,
        export_all_influences=True,
        export_leaf_bone=False,
        export_def_bones=True,
        export_reset_pose_bones=False,
    )


def print_scene_summary(label):
    objects = [(obj.name, obj.type) for obj in bpy.context.scene.objects]
    actions = [action.name for action in bpy.data.actions]
    print(f"=== {label} ===")
    print(f"objects: {objects}")
    print(f"actions: {len(actions)}")
    print("first actions:", actions[:12])


def apply_pose_as_rest(action_name):
    armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
    if not armature:
        raise RuntimeError("No armature found")
    action = bpy.data.actions.get(action_name)
    if not action:
        available = [item.name for item in bpy.data.actions if "Idle" in item.name]
        raise RuntimeError(f"Action not found: {action_name}. Idle-like actions: {available}")

    if not armature.animation_data:
        armature.animation_data_create()
    armature.animation_data.action = action
    bpy.context.scene.frame_set(int(action.frame_range[0]))
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"applied pose as rest: {action.name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--variant", choices=sorted(VARIANTS), action="append")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    variants = args.variant or list(VARIANTS)

    for variant in variants:
        settings = VARIANTS[variant]
        clear_scene()
        import_fbx(input_path, settings)
        if settings.get("pose_as_rest_action"):
            apply_pose_as_rest(settings["pose_as_rest_action"])
        print_scene_summary(variant)
        output_path = output_dir / f"dragon-ancient-{variant}.glb"
        export_glb(output_path)
        print(f"wrote: {output_path}")


if __name__ == "__main__":
    main()
