"""Helpers compartilhados do pipeline de assets da Jujuba.

Todo call sensível a versão do Blender fica NESTE arquivo (engine ID,
media_type, flags do exportador glTF). Rodar sempre headless:
    blender -b --factory-startup --python blender/<script>.py
"""

import math
import os

import bpy
from mathutils import Vector

assert bpy.app.version >= (4, 2), f"Blender >= 4.2 necessário; atual: {bpy.app.version_string}"

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW_DIR = os.path.join(REPO, 'blender', 'preview')
MODELS_DIR = os.path.join(REPO, 'public', 'models')
ICONS_DIR = os.path.join(REPO, 'public', 'icons')


def log(*args):
    print('[jujuba]', *args, flush=True)


log('Blender', bpy.app.version_string)


# ---------------------------------------------------------------- cores

def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(hx: str):
    hx = hx.lstrip('#')
    r, g, b = (int(hx[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (_srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b), 1.0)


def mat(name: str, hex_color: str, roughness: float = 0.9):
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_rgba(hex_color)
    bsdf.inputs['Roughness'].default_value = roughness
    return m


# ---------------------------------------------------------------- cena

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- primitivas
# Cada parte nasce como objeto próprio com material + vertex group (nome do
# osso). O join preserva os groups por nome — zero contabilidade de índices.

def _finish(obj, name, material, group):
    obj.name = name
    obj.data.name = name
    if material is not None:
        obj.data.materials.append(material)
    if group:
        vg = obj.vertex_groups.new(name=group)
        vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    return obj


def sphere(name, r, loc, scale=(1, 1, 1), rot=(0, 0, 0), material=None, group=None,
           segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                         radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    o.rotation_euler = rot
    return _finish(o, name, material, group)


def cone(name, r1, r2, depth, loc, scale=(1, 1, 1), rot=(0, 0, 0), material=None,
         group=None, vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2,
                                    depth=depth, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    o.rotation_euler = rot
    return _finish(o, name, material, group)


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def box(name, size, loc, material=None, group=None, bevel=0.02, rot=(0, 0, 0)):
    """Caixa com cantos arredondados (bevel aplicado) — look chunky fofo."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True)  # bevel uniforme
    if bevel:
        m = o.modifiers.new('Bevel', 'BEVEL')
        m.width = bevel
        m.segments = 3
        apply_modifiers(o)
    return _finish(o, name, material, group)


def cylinder(name, radius, depth, loc, material=None, group=None, rot=(0, 0, 0),
             vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=loc)
    o = bpy.context.active_object
    o.rotation_euler = rot
    return _finish(o, name, material, group)


def join(objs, name):
    """Junta objs no primeiro, baka transforms e dá shade smooth."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.active_object
    j.name = name
    j.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    return j


# ---------------------------------------------------------------- armature

def build_armature(name, bones: dict):
    """bones: {nome: (head, tail, parent|None)} — coordenadas de mundo, Z-up."""
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.active_object
    arm.name = name
    arm.data.name = name
    eb = arm.data.edit_bones
    default = eb[0]
    created = {}
    for bname, (head, tail, parent) in bones.items():
        b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = created[parent]
        created[bname] = b
    eb.remove(default)
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def skin(obj, arm):
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


def pose_bone(arm, bone_name, euler_deg=(0, 0, 0)):
    pb = arm.pose.bones[bone_name]
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = tuple(math.radians(a) for a in euler_deg)


# ---------------------------------------------------------------- shape keys
# Criar SEMPRE depois do join/transform_apply (nunca aplicar modifier depois).

def add_shape_key(obj, name, offset_fn):
    """offset_fn(co: Vector) -> (dx,dy,dz) | None, em coordenadas de mundo."""
    if obj.data.shape_keys is None:
        obj.shape_key_add(name='Basis', from_mix=False)
    key = obj.shape_key_add(name=name, from_mix=False)
    basis = obj.data.shape_keys.key_blocks['Basis'].data
    moved = 0
    for i in range(len(obj.data.vertices)):
        co = basis[i].co
        d = offset_fn(co)
        if d is not None:
            key.data[i].co = (co.x + d[0], co.y + d[1], co.z + d[2])
            moved += 1
    key.value = 0.0
    log(f'shape key {obj.name}.{name}: {moved} verts')
    return key


def set_shape(obj, name, value):
    obj.data.shape_keys.key_blocks[name].value = value


# ---------------------------------------------------------------- export

def export_glb(path, min_bytes=20_000):
    """Exporta a CENA TODA — chamar antes de criar câmera/luzes de preview."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=False,  # NUNCA True: meshes com shape keys
        export_morph=True,
        export_morph_normal=True,
        export_skins=True,
        export_rest_position_armature=True,
        export_animations=False,
        export_materials='EXPORT',
        export_image_format='NONE',
        export_yup=True,
    )
    size = os.path.getsize(path)
    assert size > min_bytes, f'glb suspeito de vazio: {size} bytes'
    log('exportado', path, f'{size / 1024:.0f} KB')


# ---------------------------------------------------------------- render

_ENGINE_CHAIN = ['BLENDER_EEVEE', 'CYCLES', 'BLENDER_WORKBENCH']


def setup_render(res=(640, 768), transparent=False, view_transform=None):
    s = bpy.context.scene
    want = os.environ.get('JUJUBA_ENGINE', 'BLENDER_EEVEE')
    chain = [want] + [e for e in _ENGINE_CHAIN if e != want]
    for eng in chain:
        try:
            s.render.engine = eng
            break
        except Exception as exc:  # engine indisponível nesta build
            log('engine falhou', eng, exc)
    log('engine:', s.render.engine)
    if s.render.engine == 'CYCLES':
        s.cycles.samples = 32
        try:
            s.cycles.use_denoising = True
        except Exception:
            pass
    imgset = s.render.image_settings
    if hasattr(imgset, 'media_type'):
        imgset.media_type = 'IMAGE'  # Blender 5.x: setar ANTES de file_format
    imgset.file_format = 'PNG'
    if transparent:
        s.render.film_transparent = True
        imgset.color_mode = 'RGBA'
    s.render.resolution_x, s.render.resolution_y = res
    if view_transform:  # 'Standard' = cores literais (AgX dessatura pastéis)
        s.view_settings.view_transform = view_transform

    # Mundo/ambiente quentinho
    if s.world is None:
        s.world = bpy.data.worlds.new('World')
    s.world.use_nodes = True
    bg = s.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = hex_rgba('#FFE9D6')
    bg.inputs[1].default_value = 0.7


def _look_at(cam, target):
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def add_preview_rig():
    """Câmera + luzes de estúdio. Chamar DEPOIS do export_glb."""
    bpy.ops.object.camera_add(location=(0, -2.6, 0.8))
    cam = bpy.context.active_object
    bpy.context.scene.camera = cam

    bpy.ops.object.light_add(type='SUN', location=(2, -2.5, 3.5))
    key = bpy.context.active_object
    key.data.energy = 3.2
    key.data.angle = math.radians(35)  # sombras bem suaves
    _look_at(key, (0, 0, 0.5))

    bpy.ops.object.light_add(type='AREA', location=(-2.5, -1.8, 1.4))
    fill = bpy.context.active_object
    fill.data.energy = 120
    fill.data.size = 3.5
    _look_at(fill, (0, 0, 0.6))
    return cam


def render_shot(cam, name, pos, target, out_dir=PREVIEW_DIR):
    os.makedirs(out_dir, exist_ok=True)
    cam.location = Vector(pos)
    _look_at(cam, target)
    bpy.context.scene.render.filepath = os.path.join(out_dir, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    log('render', f'{name}.png')
