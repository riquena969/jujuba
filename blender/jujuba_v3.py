"""Jujuba v3 — raposa do Robetti + olhinhos anime do SculptCuteness (ambos
CC-BY-4.0) adaptados pro nosso pipeline:

- dieta de polígonos (1,1M → ~30k) e re-rig no contrato de 17 ossos;
- olhos por ESTILO trocável (large/narrow/sad): o sculpt de 1,5M tris do pack
  NÃO entra no jogo — cada estilo é RENDERIZADO de frente e vira textura numa
  calota limpa (lib.iris_disc, ~220 tris por olho, alpha recorta o formato);
- cirurgia da boca: mandíbula articulada + ARCADA de 12 dentinhos com vãos
  (sujeirinhas moram nos vãos no modo escovação) + língua + interior escuro;
- export public/models/jujuba.glb com texturas embutidas.

Créditos obrigatórios (CC-BY) — ver README.
Fontes esperadas no scratchpad (zips originais NÃO são commitados).
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

D = math.radians

_SCRATCH = ('/private/tmp/claude-501/-Users-kevin-Projects-Cat/'
            '0e86c2dd-c9d3-4cc2-80c1-edc424897739/scratchpad')
SRC_FOX = os.environ.get('JUJUBA_V3_SRC', os.path.join(_SCRATCH, 'robetti/scene.gltf'))
SRC_EYES = os.environ.get('JUJUBA_V3_EYES', os.path.join(_SCRATCH, 'eyes/scene.gltf'))

TARGET_EAR_TOP = 1.24  # ponta das orelhas (v1 ficava parecido)
EYE_WIDTH = 0.115      # largura alvo de cada olhinho no rosto

DOT_OBJS = ['Object_11', 'Object_12', 'Object_13', 'Object_14', 'Object_15', 'Object_16']
EYES_NOSE_OBJ = 'Object_17'  # olhos esculpidos (substituídos pelo pack)
BODY_DECIMATE = {  # nome pós-bake -> ratio da dieta de polígonos
    'src_torso': 0.085,
    'src_head': 0.08,
    'src_tail': 0.10,
    'src_white': 0.095,
    'src_brows': 0.30,
}
EYE_STYLES = {'EyesLarge': 'large', 'Narroweyes': 'narrow', 'EyesSadWide': 'sad'}


def xform(p, s):
    """Rotação Z -90° (frente +X → -Y, nossa convenção) + escala uniforme."""
    return Vector((p.y * s, -p.x * s, p.z * s))


def bake_world(obj, deps):
    """Troca a mesh pela geometria AVALIADA (pós-armature/modifiers) com os
    vértices em MUNDO — mesh skinned tem matriz identidade e pose no esqueleto,
    então medir v.co direto mente."""
    ev = obj.evaluated_get(deps)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True,
                                         depsgraph=deps)
    me.transform(ev.matrix_world)
    me.name = obj.name
    obj.data = me
    obj.parent = None
    obj.matrix_world.identity()
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    return obj


def measure_fox():
    """Mede nas meshes JÁ bakeadas (v.co = mundo real da render)."""
    ref = {}
    verts = lambda name: [v.co for v in bpy.data.objects[name].data.vertices]  # noqa: E731
    top = max(v.z for v in verts('src_head'))
    s = TARGET_EAR_TOP / top
    ref['scale'] = s

    en = verts('src_eyes')
    eye_l = [v for v in en if v.y > 0.05]
    nose = [v for v in en if abs(v.y) <= 0.05]
    if len(nose) < 50:
        white = [v for v in verts('src_white') if v.z > top * 0.5]
        mx = max(v.x for v in white)
        nose = [v for v in white if v.x > mx - 0.05 and abs(v.y) < 0.12]
        lib.log('nariz: fallback pela ponta do focinho (%d verts)' % len(nose))

    def center(vs):
        c = Vector((0, 0, 0))
        for v in vs:
            c += v
        return xform(c / max(1, len(vs)), s)

    ref['eyeL'] = center(eye_l)
    nose_c = center(nose)
    nose_c.x = 0.0
    ref['nose'] = nose_c
    ref['eye_h'] = (max(v.z for v in eye_l) - min(v.z for v in eye_l)) * s
    ref['dots'] = [center([v.co for v in bpy.data.objects[f'src_dot{i}'].data.vertices])
                   for i in range(len(DOT_OBJS))]
    ref['body_top'] = max(v.z for v in verts('src_torso')) * s
    ref['head_top'] = TARGET_EAR_TOP
    lib.log('medidas fox:', {k: (tuple(round(x, 3) for x in v) if isinstance(v, Vector) else v)
                             for k, v in ref.items() if not isinstance(v, list)})
    return ref


def import_fox():
    lib.reset_scene()
    bpy.ops.import_scene.gltf(filepath=SRC_FOX)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()

    src_names = {'Object_7': 'src_torso', 'Object_8': 'src_head',
                 'Object_9': 'src_tail', 'Object_10': 'src_white',
                 'Object_18': 'src_brows', EYES_NOSE_OBJ: 'src_eyes'}
    for i, n in enumerate(DOT_OBJS):
        src_names[n] = f'src_dot{i}'
    for old, new in src_names.items():
        o = bpy.data.objects[old]
        o.name = new
        bake_world(o, deps)
        # corpo é cor sólida: UVs/cores herdadas do bake só pesam no glb
        for uv in list(o.data.uv_layers):
            o.data.uv_layers.remove(uv)
        for ca in list(o.data.color_attributes):
            o.data.color_attributes.remove(ca)

    ref = measure_fox()
    s = ref['scale']

    doomed = ['Icosphere', 'src_eyes'] + [f'src_dot{i}' for i in range(len(DOT_OBJS))]
    for name in doomed:
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)

    keep = [bpy.data.objects[n] for n in BODY_DECIMATE]
    for o in keep:
        # glTF importa objetos em rotation_mode QUATERNION — rotation_euler é
        # IGNORADO em silêncio sem esta linha (a raposa ficou de lado 2×!)
        o.rotation_mode = 'XYZ'
        o.rotation_euler = (0, 0, D(-90))
        o.scale = (s, s, s)
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    for name, ratio in BODY_DECIMATE.items():
        o = bpy.data.objects[name]
        mod = o.modifiers.new('Dec', 'DECIMATE')
        mod.ratio = ratio
        lib.apply_modifiers(o)
    total = sum(len(bpy.data.objects[n].data.polygons) for n in BODY_DECIMATE)
    lib.log('corpo pós-dieta: ~%d faces' % total)

    for mat in bpy.data.materials:
        if mat.use_nodes and 'Principled BSDF' in mat.node_tree.nodes:
            b = mat.node_tree.nodes['Principled BSDF']
            b.inputs['Roughness'].default_value = 0.9
            b.inputs['Metallic'].default_value = 0.0
    return ref


# ---------------------------------------------------------------- olhos

def bake_eye_textures():
    """Importa o pack, renderiza a bola ESQUERDA de cada estilo de frente
    (material emission = cores literais, fundo transparente) e devolve
    {estilo: png}. Depois apaga o pack — 1,5M de tris fora do jogo."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SRC_EYES)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    imported = [o for o in set(bpy.data.objects) - before]

    by_style = {}
    for o in imported:
        if o.type != 'MESH' or not o.data.materials:
            continue
        mat = o.data.materials[0].name.split('.')[0]
        style = EYE_STYLES.get(mat)
        if style and (style not in by_style
                      or len(o.data.vertices) > len(by_style[style].data.vertices)):
            by_style[style] = o

    # só o par da vez renderiza
    hidden = [(o, o.hide_render) for o in bpy.data.objects]
    for o, _ in hidden:
        o.hide_render = True

    lib.setup_render(res=(512, 512), transparent=True, view_transform='Standard')
    bpy.ops.object.camera_add(location=(0, 0, 0))
    cam = bpy.context.active_object
    cam.data.type = 'ORTHO'
    bpy.context.scene.camera = cam

    paths = {}
    for style, o in by_style.items():
        bake_world(o, deps)
        # emission puro com a baseColor do estilo → render = textura literal
        src_mat = o.data.materials[0]
        img = None
        for n in src_mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and 'baseColor' in (n.image.name or ''):
                img = n.image
        if img is None:
            for n in src_mat.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    img = n.image
        em = bpy.data.materials.new(f'bake_{style}')
        em.use_nodes = True
        nt = em.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        emi = nt.nodes.new('ShaderNodeEmission')
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        nt.links.new(tex.outputs['Color'], emi.inputs['Color'])
        nt.links.new(emi.outputs['Emission'], out.inputs['Surface'])
        o.data.materials.clear()
        o.data.materials.append(em)

        # bola esquerda (x>0): enquadra com folga
        xs = [v.co for v in o.data.vertices if v.co.x > 0]
        cx = sum(v.x for v in xs) / len(xs)
        cz = sum(v.z for v in xs) / len(xs)
        w = max(v.x for v in xs) - min(v.x for v in xs)
        h = max(v.z for v in xs) - min(v.z for v in xs)
        cam.data.ortho_scale = max(w, h) * 1.12
        cam.location = (cx, min(v.y for v in xs) - 0.5, cz)
        cam.rotation_euler = (D(90), 0, 0)  # olhando +y (a bola bulge -y)

        o.hide_render = False
        path = os.path.join(lib.PREVIEW_DIR, f'eyetex_{style}.png')
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        o.hide_render = True
        paths[style] = path
        lib.log('bake olho', style, '->', os.path.basename(path))

    for o, h in hidden:
        if o.name in bpy.data.objects:
            o.hide_render = h
    for o in imported:
        if o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    return paths


def build_eyes(ref, tex_paths):
    """Calotas limpas (iris_disc) com as texturas bakeadas; alpha recorta o
    formato do olho. large = EyeL/EyeR (padrão), extras = EyeStyle<Nome><L|R>."""
    out = {}
    er = EYE_WIDTH / 2
    for style, path in tex_paths.items():
        img = bpy.data.images.load(path)
        img.name = f'EyeTex_{style}'
        mat = bpy.data.materials.new(f'EyeStyleMat{style.capitalize()}')
        mat.use_nodes = True
        b = mat.node_tree.nodes['Principled BSDF']
        b.inputs['Roughness'].default_value = 0.3
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = img
        mat.node_tree.links.new(tex.outputs['Color'], b.inputs['Base Color'])
        mat.node_tree.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
        for attr, val in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            if hasattr(mat, attr):
                try:
                    setattr(mat, attr, val)
                except Exception:
                    pass
        for side, sx in (('L', 1), ('R', -1)):
            c = ref['eyeL'].copy()
            c.x = abs(c.x) * sx
            name = (f'Eye{side}' if style == 'large'
                    else f'EyeStyle{style.capitalize()}{side}')
            cap = lib.iris_disc(name, er, (0, 0, 0), mat, group=f'eye{side}', n=20)
            # baka a posição nos vértices: node com skin IGNORA transform no glTF
            cap.data.transform(Matrix.Translation((c.x, c.y - 0.006, c.z)))
            out.setdefault(style, {})[side] = cap
    lib.log('olhos:', {k: [o.name for o in v.values()] for k, v in out.items()})
    return out


# ---------------------------------------------------------------- build

def build():
    ref = import_fox()
    nose = ref['nose']
    head_top = ref['head_top']
    mouth_z = nose.z - 0.055
    white_vs = [v.co for v in bpy.data.objects['src_white'].data.vertices]
    chin_y = min(v.y for v in white_vs
                 if abs(v.x) < 0.06 and abs(v.z - mouth_z) < 0.025)
    # o focinho é um "W": no CENTRO a superfície recua — dentes/língua se
    # escondem atrás da profundidade CENTRAL, não da bochecha
    chin_c = min(v.y for v in white_vs
                 if abs(v.x) < 0.018 and abs(v.z - mouth_z) < 0.03)
    lib.log('boca: chin_y=%.3f chin_c=%.3f mouth_z=%.3f' % (chin_y, chin_c, mouth_z))
    lib.log('TS: pivô jaw three=(0, %.3f, %.3f) | boca-frente three=(0, %.3f, %.3f)'
            % (mouth_z + 0.02, -(chin_y + 0.14), mouth_z, -chin_y))

    M = {name: lib.mat(name, hx) for name, hx in {
        'NoseDark': '#4A2E24', 'MouthDark': '#5A2A28', 'ToothWhite': '#FFFFFF',
        'TonguePink': '#FF8FA8', 'WhiskerDark': '#4A3626',
    }.items()}
    tooth_bsdf = M['ToothWhite'].node_tree.nodes['Principled BSDF']
    tooth_bsdf.inputs['Roughness'].default_value = 0.35
    # brilhinho próprio: os dentes moram na sombra da boca — sem isso somem
    if 'Emission Color' in tooth_bsdf.inputs:
        tooth_bsdf.inputs['Emission Color'].default_value = (1, 1, 1, 1)
        tooth_bsdf.inputs['Emission Strength'].default_value = 0.22

    parts = [bpy.data.objects[n] for n in BODY_DECIMATE]

    parts.append(lib.sphere('nose_tip', 0.034, tuple(nose), scale=(1.25, 0.75, 0.8),
                            material=M['NoseDark'], group='head', segments=16, rings=12))
    for i, c in enumerate(ref['dots']):
        parts.append(lib.sphere(f'whisker_{i}', 0.011, (c.x, c.y - 0.006, c.z),
                                material=M['WhiskerDark'], group='head',
                                segments=10, rings=8))

    # interior escuro recuado atrás da profundidade CENTRAL do focinho
    parts.append(lib.sphere('mouth_in', 0.075, (0, chin_c + 0.085, mouth_z - 0.005),
                            scale=(0.95, 0.6, 0.55), material=M['MouthDark'],
                            group='head', segments=16, rings=12))

    # ARCADA: 6 dentinhos em cima + 6 embaixo, com VÃOS (a sujeira mora neles)
    xs6 = [-0.062, -0.037, -0.0125, 0.0125, 0.037, 0.062]
    teeth_parts = []
    for i, x in enumerate(xs6):
        arc = (abs(x) / 0.062) ** 2
        big = 1.0 if abs(x) > 0.03 else 1.12  # centrais um tico maiores
        teeth_parts.append(lib.box(
            f'tooth_u{i}', (0.02, 0.016, 0.024 * big),
            (x, chin_c + 0.024 + 0.01 * arc, mouth_z + 0.009), material=M['ToothWhite'],
            group='head', bevel=0.005))
        teeth_parts.append(lib.box(
            f'tooth_l{i}', (0.018, 0.015, 0.019),
            (x * 0.92, chin_c + 0.028 + 0.01 * arc, mouth_z - 0.017),
            material=M['ToothWhite'], group='jaw', bevel=0.005))
    teeth = lib.join(teeth_parts, 'Teeth')
    tongue = lib.join([lib.sphere('tongue_pad', 0.05, (0, chin_c + 0.07, mouth_z - 0.026),
                                  scale=(1.05, 1.25, 0.5), material=M['TonguePink'],
                                  group='jaw')], 'Tongue')

    body = lib.join(parts, 'Jujuba')

    tex_paths = bake_eye_textures()
    eye_sets = build_eyes(ref, tex_paths)

    neck_z = ref['body_top'] - 0.03
    eye_l = ref['eyeL']
    bones = {
        'root':     ((0, 0, 0.0), (0, 0, 0.12), None),
        'spine':    ((0, 0, 0.13), (0, 0, 0.33), 'root'),
        'chest':    ((0, 0, 0.33), (0, 0, neck_z - 0.06), 'spine'),
        'neck':     ((0, 0, neck_z - 0.06), (0, 0, neck_z + 0.05), 'chest'),
        'head':     ((0, 0, neck_z + 0.05), (0, 0, head_top - 0.14), 'neck'),
        'jaw':      ((0, chin_y + 0.14, mouth_z + 0.02),
                     (0, chin_y - 0.04, mouth_z - 0.03), 'head'),
        'earL':     ((0.13, 0.03, head_top - 0.20), (0.20, 0.05, head_top + 0.01), 'head'),
        'earR':     ((-0.13, 0.03, head_top - 0.20), (-0.20, 0.05, head_top + 0.01), 'head'),
        'eyeL':     ((abs(eye_l.x), eye_l.y + 0.05, eye_l.z),
                     (abs(eye_l.x), eye_l.y - 0.05, eye_l.z), 'head'),
        'eyeR':     ((-abs(eye_l.x), eye_l.y + 0.05, eye_l.z),
                     (-abs(eye_l.x), eye_l.y - 0.05, eye_l.z), 'head'),
        'armL':     ((0.16, -0.01, neck_z - 0.10), (0.24, -0.03, 0.30), 'chest'),
        'armR':     ((-0.16, -0.01, neck_z - 0.10), (-0.24, -0.03, 0.30), 'chest'),
        'legL':     ((0.10, 0, 0.16), (0.10, -0.02, 0.03), 'root'),
        'legR':     ((-0.10, 0, 0.16), (-0.10, -0.02, 0.03), 'root'),
        'tailBase': ((0, 0.16, 0.30), (0.02, 0.30, 0.44), 'spine'),
        'tailMid':  ((0.02, 0.30, 0.44), (0.05, 0.40, 0.60), 'tailBase'),
        'tailTip':  ((0.05, 0.40, 0.60), (0.09, 0.46, 0.84), 'tailMid'),
    }
    arm = lib.build_armature('JujubaRig', bones)

    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')

    # mandíbula EXPLÍCITA: o queixo (e SÓ ele) desce com o jaw — pinta com
    # falloff radial e LIMPA os outros grupos nesses vértices (senão o auto-
    # weight de neck/chest dilui e o queixo nem se mexe)
    jaw_vg = body.vertex_groups.get('jaw') or body.vertex_groups.new(name='jaw')
    head_vg = body.vertex_groups.get('head') or body.vertex_groups.new(name='head')
    others = [body.vertex_groups[n] for n in ('neck', 'chest', 'spine', 'root')
              if n in body.vertex_groups]
    jaw_tip = Vector((0, chin_y - 0.02, mouth_z - 0.035))
    jaw_vg.remove([v.index for v in body.data.vertices])
    painted = 0
    for v in body.data.vertices:
        co = v.co
        if co.z > mouth_z + 0.012 or co.y > -0.10:
            continue
        w = 1.0 - lib.smoothstep(0.12, 0.30, (co - jaw_tip).length)
        w *= lib.smoothstep(0.520, 0.555, co.z)  # não puxa o peitoral
        if w > 0.01:
            jaw_vg.add([v.index], w, 'REPLACE')
            head_vg.add([v.index], max(0.0, 1.0 - w), 'REPLACE')
            for g in others:
                g.remove([v.index])
            painted += 1
    probe_target = Vector((0, chin_y + 0.005, mouth_z - 0.04))
    probe = min(body.data.vertices, key=lambda v: (v.co - probe_target).length)
    lib.log('jaw pintado em %d verts; probe do queixo:' % painted,
            {body.vertex_groups[g.group].name: round(g.weight, 2) for g in probe.groups})
    for gname in ('eyeL', 'eyeR'):
        vg = body.vertex_groups.get(gname)
        if vg is not None:
            body.vertex_groups.remove(vg)

    lib.skin(teeth, arm)
    lib.skin(tongue, arm)
    for style in eye_sets.values():
        for o in style.values():
            lib.skin(o, arm)

    def smile(co):
        if co.y < chin_y + 0.15 and mouth_z - 0.05 < co.z < mouth_z + 0.05 \
                and 0.04 < abs(co.x) < 0.14:
            t = min(1.0, (abs(co.x) - 0.04) / 0.06)
            return (0, 0, 0.02 * t)
        return None

    lib.add_shape_key(body, 'smile', smile)

    return body, eye_sets, teeth, tongue, arm, ref


def previews(body, eye_sets, arm, ref):
    lib.setup_render(res=(640, 768))
    cam = lib.add_preview_rig()
    mid = (0, 0, 0.6)

    def show_style(name):
        for style, sides in eye_sets.items():
            for o in sides.values():
                o.hide_render = style != name

    show_style('large')
    lib.render_shot(cam, 'front', (0, -2.6, 0.78), mid)
    lib.render_shot(cam, 'threequarter', (1.75, -2.05, 0.9), mid)
    lib.render_shot(cam, 'side', (2.6, 0, 0.78), mid)
    face_z = ref['eyeL'].z - 0.08
    lib.render_shot(cam, 'face', (0, -1.0, face_z + 0.05), (0, 0, face_z))

    lib.set_shape(body, 'smile', 1.0)
    lib.render_shot(cam, 'expr_happy', (0, -1.0, face_z + 0.05), (0, 0, face_z))
    lib.set_shape(body, 'smile', 0.0)

    show_style('narrow')
    lib.render_shot(cam, 'expr_sono', (0, -1.0, face_z + 0.05), (0, 0, face_z))
    show_style('sad')
    lib.render_shot(cam, 'expr_triste', (0, -1.0, face_z + 0.05), (0, 0, face_z))
    show_style('large')

    lib.pose_bone(arm, 'jaw', (26, 0, 0))
    lib.render_shot(cam, 'expr_jawopen', (0, -1.0, face_z + 0.05), (0, 0, face_z))
    lib.render_shot(cam, 'expr_jawopen_side', (0.95, -0.75, 0.75), (0, -0.18, 0.62))
    lib.pose_bone(arm, 'jaw', (0, 0, 0))


if __name__ == '__main__':
    body, eye_sets, teeth, tongue, arm, ref = build()
    lib.export_glb(os.path.join(lib.MODELS_DIR, 'jujuba.glb'), images=True)
    previews(body, eye_sets, arm, ref)
    lib.log('OK v3')
