"""Helpers compartilhados do pipeline de assets da Jujuba.

Todo call sensível a versão do Blender fica NESTE arquivo (engine ID,
media_type, flags do exportador glTF). Rodar sempre headless:
    blender -b --factory-startup --python blender/<script>.py
"""

import math
import os

import bmesh
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


# ---------------------------------------------------------------- lofts (v2)
# Técnica da raposinha v2: cage low-poly construída anel a anel + Subdivision
# Surface aplicado → superfície orgânica contínua (sem "ovais sobrepostos").

def ring(z, rx, ry=None, n=20, cy=0.0, shape=None):
    """Anel elíptico horizontal em z. shape(theta)->escala radial opcional.
    Convenção: frente = -y (theta com sin negativo)."""
    ry = rx if ry is None else ry
    pts = []
    for i in range(n):
        th = i / n * 2 * math.pi
        s = shape(th) if shape else 1.0
        pts.append((math.cos(th) * rx * s, cy + math.sin(th) * ry * s, z))
    return pts


def loft_mesh(name, rings, material=None, group=None, close_bottom=True,
              close_top=True, subdiv=2):
    """Ponte quads entre anéis consecutivos (mesmo N), tampas, smooth, subsurf
    APLICADO (regra: modifiers sempre aplicados antes de shape keys/export)."""
    bm = bmesh.new()
    ring_verts = []
    for r in rings:
        ring_verts.append([bm.verts.new(Vector(p)) for p in r])
    for a, b in zip(ring_verts, ring_verts[1:]):
        n = len(a)
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if close_bottom:
        bm.faces.new(tuple(reversed(ring_verts[0])))
    if close_top:
        bm.faces.new(tuple(ring_verts[-1]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if subdiv:
        m = obj.modifiers.new('Subsurf', 'SUBSURF')
        m.levels = m.render_levels = subdiv
        apply_modifiers(obj)
        obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
    return _finish(obj, name, material, group)


def paint(obj, color_fn):
    """Vertex colors por função de posição: color_fn(Vector) -> (r,g,b,a) linear."""
    mesh = obj.data
    layer = mesh.color_attributes.new(name='Col', type='BYTE_COLOR', domain='CORNER')
    for loop in mesh.loops:
        co = mesh.vertices[loop.vertex_index].co
        layer.data[loop.index].color = color_fn(co)


def mat_vcol(name, roughness=0.85):
    """Material cuja Base Color vem do vertex color 'Col' (exporta COLOR_0)."""
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = roughness
    vc = m.node_tree.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    m.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def make_iris_material(name='IrisAmber'):
    """Íris âmbar com pupila e 2 brilhos, 100% gerada por código (128px)."""
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    size = 128
    img = bpy.data.images.new('IrisTex', size, size, alpha=True)
    px = [0.0] * (size * size * 4)
    pupil = tuple(hex_rgba('#241812'))
    amber_in = tuple(hex_rgba('#F2B24E'))
    amber_out = tuple(hex_rgba('#9C5A16'))
    for j in range(size):
        for i in range(size):
            x = (i - size / 2) / (size / 2)
            y = (j - size / 2) / (size / 2)
            r = math.sqrt(x * x + y * y)
            ang = math.atan2(y, x)
            streak = 0.92 + 0.08 * math.sin(ang * 22 + r * 9)
            if r < 0.34:
                c = pupil[:3]
            else:
                t = smoothstep(0.34, 1.0, r)
                c = [v * streak for v in lerp3(amber_in[:3], amber_out[:3], t)]
                if r < 0.44:  # borda da pupila
                    k = smoothstep(0.34, 0.44, r)
                    c = lerp3(pupil[:3], c, k)
                if r > 0.9:  # aro externo escuro
                    c = [v * 0.5 for v in c]
            # brilhos estilo anime (bakeados)
            d1 = math.hypot(x + 0.34, y - 0.4)
            d2 = math.hypot(x - 0.3, y + 0.28)
            if d1 < 0.2 or d2 < 0.1:
                c = (1.0, 1.0, 1.0)
            idx = (j * size + i) * 4
            px[idx:idx + 4] = [c[0], c[1], c[2], 1.0]
    img.pixels[:] = px
    img.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.2
    tex = m.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def iris_disc(name, radius, loc, material, group=None, n=24):
    """CALOTA convexa (bulge pra -y) com UV planar — a íris abraça o olho e
    fica visível de qualquer ângulo de câmera (disco plano afunda na esfera)."""
    rings_spec = [(radius, 0.0), (radius * 0.72, -0.011), (radius * 0.4, -0.018),
                  (radius * 0.12, -0.022)]
    bm = bmesh.new()
    ring_verts = []
    for r, yoff in rings_spec:
        ring_verts.append([bm.verts.new((math.cos(i / n * 2 * math.pi) * r, yoff,
                                         math.sin(i / n * 2 * math.pi) * r))
                           for i in range(n)])
    for a, b in zip(ring_verts, ring_verts[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    center = bm.verts.new((0, -0.023, 0))
    last = ring_verts[-1]
    for i in range(n):
        bm.faces.new((center, last[i], last[(i + 1) % n]))
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co.x / (radius * 2) + 0.5, co.z / (radius * 2) + 0.5)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    return _finish(obj, name, material, group)


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


def weight_bands(obj, bands, blend=0.035):
    """Pesos por faixa de altura pra malha ÚNICA (v2): bands=[(grupo, z0, z1)].
    Rampa linear de `blend` nas fronteiras entre faixas consecutivas."""
    groups = {}
    for name, _, _ in bands:
        if name not in groups:
            groups[name] = obj.vertex_groups.new(name=name)
    for v in obj.data.vertices:
        z = v.co.z
        weights = []
        for name, z0, z1 in bands:
            w = min(smoothstep(z0 - blend, z0 + blend, z),
                    1 - smoothstep(z1 - blend, z1 + blend, z))
            if w > 0.001:
                weights.append((name, w))
        total = sum(w for _, w in weights) or 1.0
        for name, w in weights:
            groups[name].add([v.index], w / total, 'REPLACE')


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

def export_glb(path, min_bytes=20_000, images=False):
    """Exporta a CENA TODA — chamar antes de criar câmera/luzes de preview.
    images=True embute texturas (íris da v2)."""
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
        export_image_format='AUTO' if images else 'NONE',
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
