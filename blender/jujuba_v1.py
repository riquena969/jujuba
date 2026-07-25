"""Jujuba, a raposinha 🦊 — modelo paramétrico chibi.

Constrói malha + armature (17 ossos) + shape keys e exporta
public/models/jujuba.glb, depois renderiza previews pra iteração visual.

Convenções: Z-up (Blender), rosto voltado pra -Y. O exportador converte
pra Y-up/+Z-frente do glTF — no jogo ela nasce olhando pra câmera.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

D = math.radians

# ------------------------------------------------------------------ knobs
# Proporções chibi: cabeça enorme, corpo pequeno, tudo redondinho.

COLORS = {
    'FurOrange': '#F97B2F',
    'FurCream': '#FFF3E3',
    'InnerEarPink': '#FFB3C7',
    'NoseDark': '#4A2E24',
    'EyeDark': '#3B2620',
    'HighlightWhite': '#FFFFFF',
    'BlushPink': '#FF9FB2',
    'MouthDark': '#5A2A28',
    'PawCocoa': '#6B4632',
    'ToothWhite': '#FFFFFF',
    'TonguePink': '#FF8FA8',
}

P = {
    # cabeça (topo dela ≈ 1.10; orelhas passam disso de propósito)
    'head':     dict(r=0.26, pos=(0, 0, 0.86), scale=(1.06, 0.94, 0.92)),
    # focinho = lábio superior (um tico mais saltado); mandíbula de largura
    # casada sela logo abaixo — a emenda é a linha da boca. O interior escuro
    # fica 100% atrás da mandíbula fechada e aparece quando ela abre.
    'muzzle':   dict(r=0.125, pos=(0, -0.175, 0.815), scale=(1.18, 0.85, 0.55)),
    'jaw':      dict(r=0.10, pos=(0, -0.15, 0.762), scale=(1.05, 0.82, 0.46)),
    'mouth':    dict(r=0.095, pos=(0, -0.17, 0.762), scale=(0.85, 0.55, 0.42)),
    'nose':     dict(r=0.030, pos=(0, -0.284, 0.845), scale=(1.25, 0.7, 0.8)),
    'eye':      dict(r=0.055, x=0.10, y=-0.215, z=0.915, squash=0.62),
    'highlight': dict(r=0.016, off=(0.018, -0.030, 0.022)),  # off.x NÃO espelha
    'blush':    dict(r=0.050, pos=(0.148, -0.185, 0.788), scale=(0.9, 0.38, 0.66)),
    'ear':      dict(r1=0.105, r2=0.014, depth=0.30, pos=(0.155, 0.01, 1.10),
                    tilt_out=22, tilt_back=8, flat=0.55),
    'ear_in':   dict(r1=0.060, r2=0.008, depth=0.20, dy=-0.045, dz=-0.015, flat=0.35),
    # corpo
    'body':     dict(r=0.24, pos=(0, 0, 0.40), scale=(0.95, 0.88, 1.12)),
    'chest':    dict(r=0.145, pos=(0, -0.155, 0.46), scale=(0.82, 0.45, 1.05)),
    'arm':      dict(r=0.062, pos=(0.19, -0.015, 0.44), scale=(0.7, 0.7, 1.45), tilt=8),
    'hand':     dict(r=0.055, pos=(0.235, -0.045, 0.295)),
    'leg':      dict(r=0.085, pos=(0.105, 0, 0.13), scale=(0.9, 0.9, 1.25)),
    'foot':     dict(r=0.075, pos=(0.115, -0.055, 0.055), scale=(0.95, 1.35, 0.62)),
    # rabo: plumão subindo pelo lado dela (+x), ponta espiando na visão frontal
    'tail': [
        dict(r=0.115, pos=(0.03, 0.19, 0.32), scale=(1.0, 1.12, 1.0)),
        dict(r=0.150, pos=(0.09, 0.30, 0.47), scale=(1.0, 1.08, 1.10)),
        dict(r=0.130, pos=(0.175, 0.335, 0.64), scale=(1.0, 1.0, 1.10)),
    ],
    'tail_tip': dict(r=0.110, pos=(0.225, 0.34, 0.79)),
}

BONES = {
    'root':     ((0, 0, 0.0), (0, 0, 0.12), None),
    'spine':    ((0, 0, 0.14), (0, 0, 0.34), 'root'),
    'chest':    ((0, 0, 0.34), (0, 0, 0.58), 'spine'),
    'neck':     ((0, 0, 0.58), (0, 0, 0.68), 'chest'),
    'head':     ((0, 0, 0.68), (0, 0, 0.98), 'neck'),
    # pivô do maxilar bem atrás (linha da orelha) → abrir gira pra baixo em arco
    'jaw':      ((0, -0.02, 0.78), (0, -0.22, 0.75), 'head'),
    'earL':     ((0.15, 0.01, 1.05), (0.21, 0.03, 1.26), 'head'),
    'earR':     ((-0.15, 0.01, 1.05), (-0.21, 0.03, 1.26), 'head'),
    'eyeL':     ((0.098, -0.19, 0.90), (0.098, -0.26, 0.90), 'head'),
    'eyeR':     ((-0.098, -0.19, 0.90), (-0.098, -0.26, 0.90), 'head'),
    'armL':     ((0.19, -0.01, 0.50), (0.25, -0.03, 0.31), 'chest'),
    'armR':     ((-0.19, -0.01, 0.50), (-0.25, -0.03, 0.31), 'chest'),
    'legL':     ((0.105, 0, 0.16), (0.105, -0.02, 0.03), 'root'),
    'legR':     ((-0.105, 0, 0.16), (-0.105, -0.02, 0.03), 'root'),
    'tailBase': ((0, 0.14, 0.30), (0.06, 0.26, 0.42), 'spine'),
    'tailMid':  ((0.06, 0.26, 0.42), (0.12, 0.33, 0.56), 'tailBase'),
    'tailTip':  ((0.12, 0.33, 0.56), (0.205, 0.35, 0.80), 'tailMid'),
}


def mirror(pos):
    return (-pos[0], pos[1], pos[2])


def build():
    lib.reset_scene()
    M = {name: lib.mat(name, hx) for name, hx in COLORS.items()}
    M['EyeDark'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.25

    parts = []

    def S(name, spec, material, group, mirrored=False, **kw):
        pos = mirror(spec['pos']) if mirrored else spec['pos']
        parts.append(lib.sphere(name, spec['r'], pos, scale=spec.get('scale', (1, 1, 1)),
                                material=material, group=group, **kw))

    # ---- cabeça e rosto ----
    S('head_ball', P['head'], M['FurOrange'], 'head')
    S('muzzle', P['muzzle'], M['FurCream'], 'head')
    S('jaw_lower', P['jaw'], M['FurCream'], 'jaw')
    S('mouth_in', P['mouth'], M['MouthDark'], 'head')
    S('nose_tip', P['nose'], M['NoseDark'], 'head')
    S('blush_l', P['blush'], M['BlushPink'], 'head')
    parts.append(lib.sphere('blush_r', P['blush']['r'], mirror(P['blush']['pos']),
                            scale=P['blush']['scale'], material=M['BlushPink'], group='head'))

    # ---- orelhas (cone achatado + interior rosa) ----
    e, ei = P['ear'], P['ear_in']
    for side, sx, grp in (('l', 1, 'earL'), ('r', -1, 'earR')):
        rot = (D(e['tilt_back']), D(sx * e['tilt_out']), 0)
        pos = (sx * e['pos'][0], e['pos'][1], e['pos'][2])
        parts.append(lib.cone(f'ear_{side}', e['r1'], e['r2'], e['depth'], pos,
                              scale=(1, e['flat'], 1), rot=rot,
                              material=M['FurOrange'], group=grp))
        ipos = (sx * e['pos'][0], e['pos'][1] + ei['dy'], e['pos'][2] + ei['dz'])
        parts.append(lib.cone(f'ear_in_{side}', ei['r1'], ei['r2'], ei['depth'], ipos,
                              scale=(1, ei['flat'], 1), rot=rot,
                              material=M['InnerEarPink'], group=grp))

    # ---- corpo ----
    S('body_egg', P['body'], M['FurOrange'], 'chest')
    S('chest_patch', P['chest'], M['FurCream'], 'chest')
    for side, mir, grp in (('l', False, ''), ('r', True, '')):
        sx = -1 if mir else 1
        a = P['arm']
        parts.append(lib.sphere(f'arm_{side}', a['r'],
                                mirror(a['pos']) if mir else a['pos'],
                                scale=a['scale'], rot=(0, D(sx * a['tilt']), 0),
                                material=M['FurOrange'], group=f'arm{side.upper()}'))
        S(f'hand_{side}', P['hand'], M['PawCocoa'], f'arm{side.upper()}', mirrored=mir)
        S(f'leg_{side}', P['leg'], M['FurOrange'], f'leg{side.upper()}', mirrored=mir)
        S(f'foot_{side}', P['foot'], M['PawCocoa'], f'leg{side.upper()}', mirrored=mir)

    # ---- rabo ----
    tail_groups = ['tailBase', 'tailMid', 'tailTip']
    for i, seg in enumerate(P['tail']):
        S(f'tail_{i}', seg, M['FurOrange'], tail_groups[i])
    S('tail_tip_ball', P['tail_tip'], M['FurCream'], 'tailTip')

    body = lib.join(parts, 'Jujuba')

    # ---- olhos (meshes separados, 100% no osso do olho) ----
    eyes = {}
    ey = P['eye']
    hl = P['highlight']
    for side, sx in (('L', 1), ('R', -1)):
        ball = lib.sphere(f'eyeball_{side}', ey['r'], (sx * ey['x'], ey['y'], ey['z']),
                          scale=(1, ey['squash'], 1), material=M['EyeDark'],
                          group=f'eye{side}')
        # brilho no MESMO lado nos dois olhos (luz vem de uma direção só)
        spark = lib.sphere(f'spark_{side}', hl['r'],
                           (sx * ey['x'] + hl['off'][0], ey['y'] + hl['off'][1],
                            ey['z'] + hl['off'][2]),
                           material=M['HighlightWhite'], group=f'eye{side}',
                           segments=12, rings=8)
        eyes[side] = lib.join([ball, spark], f'Eye{side}')

    # ---- dentinhos + língua (escondidos com a boca fechada; a escovação dá
    # zoom na boca aberta e o material 'Teeth' amarela conforme o stat) ----
    tooth = M['ToothWhite']
    tooth.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.35
    teeth_parts = []
    # fileira de cima gruda no crânio ('head'), a de baixo desce com o 'jaw'.
    # Janela apertada da v1: cada dente precisa caber ATRÁS do maxilar fechado
    # e À FRENTE do focinho/interior (senão some ou vaza) — valores calculados
    # nos elipsoides de P e conferidos no render expr_jawopen.
    upper = [(0.052, -0.2055, 0.7545), (0.019, -0.212, 0.7515),
             (-0.019, -0.212, 0.7515), (-0.052, -0.2055, 0.7545)]
    lower = [(0.046, -0.208, 0.770), (0.017, -0.214, 0.772),
             (-0.017, -0.214, 0.772), (-0.046, -0.208, 0.770)]
    for i, pos in enumerate(upper):
        teeth_parts.append(lib.sphere(f'tooth_u{i}', 0.0155, pos, scale=(1, 0.6, 1.05),
                                      material=tooth, group='head', segments=12, rings=8))
    for i, pos in enumerate(lower):
        teeth_parts.append(lib.sphere(f'tooth_l{i}', 0.0135, pos, scale=(1, 0.62, 1.0),
                                      material=tooth, group='jaw', segments=12, rings=8))
    teeth = lib.join(teeth_parts, 'Teeth')
    tongue = lib.join([lib.sphere('tongue_pad', 0.048, (0, -0.168, 0.750),
                                  scale=(1.05, 1.2, 0.5), material=M['TonguePink'],
                                  group='jaw')], 'Tongue')

    # ---- armature + skinning ----
    arm = lib.build_armature('JujubaRig', BONES)
    lib.skin(body, arm)
    lib.skin(eyes['L'], arm)
    lib.skin(eyes['R'], arm)
    lib.skin(teeth, arm)
    lib.skin(tongue, arm)

    # ---- shape keys (sempre DEPOIS de join/apply) ----
    # blink: achata o olho num arco "∩" feliz
    for side in ('L', 'R'):
        obj = eyes[side]
        cx = (1 if side == 'L' else -1) * ey['x']
        cz = ey['z']
        rx = ey['r']

        def blink(co, cx=cx, cz=cz, rx=rx):
            t = max(0.0, 1.0 - ((co.x - cx) / (rx * 1.15)) ** 2)
            target_z = cz - 0.012 + 0.034 * t  # linha curvada pra cima no centro
            # achata em arco e recua pro rosto (some o "calombo" do olho)
            return (0, 0.014, (target_z - co.z) * 0.96)

        lib.add_shape_key(obj, f'blink{side}', blink)

    # smile: cantos do queixo sobem (∪) — região da mandíbula, longe do centro
    def smile(co):
        if co.y < -0.15 and 0.72 < co.z < 0.82 and 0.05 < abs(co.x) < 0.15:
            t = min(1.0, (abs(co.x) - 0.05) / 0.06)
            return (0, 0, 0.018 * t)
        return None

    lib.add_shape_key(body, 'smile', smile)

    return body, eyes, arm


def previews(body, eyes, arm):
    lib.setup_render(res=(640, 768))
    cam = lib.add_preview_rig()
    mid = (0, 0, 0.58)
    lib.render_shot(cam, 'front', (0, -2.6, 0.78), mid)
    lib.render_shot(cam, 'threequarter', (1.75, -2.05, 0.9), mid)
    lib.render_shot(cam, 'side', (2.6, 0, 0.78), mid)
    lib.render_shot(cam, 'back', (0, 2.6, 0.78), mid)
    lib.render_shot(cam, 'face', (0, -1.05, 0.92), (0, 0, 0.87))

    # expressões
    lib.set_shape(eyes['L'], 'blinkL', 1.0)
    lib.set_shape(eyes['R'], 'blinkR', 1.0)
    lib.set_shape(body, 'smile', 1.0)
    lib.pose_bone(arm, 'jaw', (10, 0, 0))
    lib.render_shot(cam, 'expr_happy', (0, -1.05, 0.92), (0, 0, 0.87))

    lib.set_shape(eyes['L'], 'blinkL', 0.0)
    lib.set_shape(eyes['R'], 'blinkR', 0.0)
    lib.set_shape(body, 'smile', 0.0)
    lib.pose_bone(arm, 'jaw', (30, 0, 0))
    lib.render_shot(cam, 'expr_jawopen', (0, -1.05, 0.92), (0, 0, 0.87))
    lib.pose_bone(arm, 'jaw', (0, 0, 0))


if __name__ == '__main__':
    body, eyes, arm = build()
    lib.export_glb(os.path.join(lib.MODELS_DIR, 'jujuba.glb'))
    previews(body, eyes, arm)
    lib.log('OK')
