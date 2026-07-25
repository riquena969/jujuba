"""Raposinha v2 — malha contínua por cage + Subdivision Surface.

Fase 1/2: cabeça com focinho emergindo do próprio loft (bulge radial),
tufos de bochecha em zigue-zague, corpo contínuo (pés→topo numa malha só),
membros com mãozinhas, cauda em S, olhos com íris âmbar texturizada.

Convenções v1 mantidas: Z-up, frente = -y, alturas compatíveis (jogo não muda).
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

D = math.radians
TAU = 2 * math.pi

# ------------------------------------------------------------------ paleta
ORANGE = lib.hex_rgba('#F4741F')
ORANGE_DEEP = lib.hex_rgba('#D95F14')
CREAM = lib.hex_rgba('#FFF4E4')
CHOCO = lib.hex_rgba('#5C3A26')
PINK = lib.hex_rgba('#FFB3C7')
BLUSH = lib.hex_rgba('#FF9FB2')


def frontness(th):
    """1 na frente (-y), 0 atrás."""
    return max(0.0, -math.sin(th))


def sideness(th):
    return abs(math.cos(th))


# ------------------------------------------------------------------ cabeça+corpo
# Um único loft contínuo dos pés ao topo da cabeça.

def core_shape(z_muzz, tuft):
    """shape(theta) do anel: bulge frontal do focinho + tufos laterais."""
    def s(th):
        # focinho: bump frontal ESTREITO (expoente alto = snout, não papada)
        v = 1.0 + z_muzz * frontness(th) ** 6.0
        v += tuft * sideness(th) ** 3
        return v
    return s


CORE_RINGS = [
    # (z, rx, ry, muzzle, tuft) — corpo baixinho + CABEÇONA chibi
    (0.02, 0.12, 0.11, 0, 0),
    (0.06, 0.17, 0.155, 0, 0),
    (0.12, 0.215, 0.19, 0, 0),
    (0.19, 0.245, 0.218, 0, 0),
    (0.26, 0.252, 0.225, 0, 0),   # barriguinha gorda
    (0.33, 0.24, 0.215, 0, 0),
    (0.40, 0.21, 0.19, 0, 0),
    (0.46, 0.17, 0.155, 0, 0),
    (0.51, 0.135, 0.125, 0, 0),   # pescoço
    (0.56, 0.15, 0.14, 0, 0),
    (0.62, 0.225, 0.208, 0.04, 0),
    (0.68, 0.272, 0.248, 0.20, 0.16),
    (0.73, 0.292, 0.263, 0.42, 0.05),
    (0.775, 0.30, 0.268, 0.62, 0.28),
    (0.82, 0.296, 0.265, 0.44, 0.07),
    (0.865, 0.288, 0.26, 0.16, 0.24),
    (0.91, 0.276, 0.252, 0, 0.06),
    (0.965, 0.25, 0.232, 0, 0),
    (1.02, 0.208, 0.196, 0, 0),
    (1.08, 0.145, 0.138, 0, 0),
    (1.125, 0.055, 0.055, 0, 0),
]


def build_core(mat):
    rings = [lib.ring(z, rx, ry, n=20, shape=core_shape(mz, tf))
             for z, rx, ry, mz, tf in CORE_RINGS]
    return lib.loft_mesh('core', rings, material=mat, group=None, subdiv=2)


def paint_core(obj):
    def color(co):
        x, y, z = co.x, co.y, co.z
        r = max(0.03, math.hypot(x, y))
        front = max(0.0, -y / r)
        # base laranja com costas levemente mais profundas
        base = lib.lerp3(ORANGE[:3], ORANGE_DEEP[:3], lib.smoothstep(0.0, 0.9, y / r if r else 0) * 0.5)
        c = base
        # peito/barriga creme (faixa frontal, do quadril ao queixo)
        belly = lib.smoothstep(0.45, 0.9, front) * lib.smoothstep(0.03, 0.13, z) * (1 - lib.smoothstep(0.48, 0.56, z))
        # focinho creme COMPACTO: gaussiana no ângulo horizontal a partir da frente
        phi = math.atan2(abs(x), -y) if y < 0 else math.pi  # 0 = bem na frente
        muzz = math.exp(-((phi / 0.62) ** 2)) * lib.smoothstep(0.63, 0.70, z) * (1 - lib.smoothstep(0.85, 0.89, z))
        cream_k = min(1.0, belly + muzz)
        c = lib.lerp3(c, CREAM[:3], cream_k)
        # BOCA: o "teto" da boca é o sub-focinho do próprio loft — pintado de
        # escuro, aparece quando o queixo abre (escondido atrás dele fechado)
        if y < -0.20 and 0.700 < z < 0.738 and abs(x) < 0.085:
            k = (1 - lib.smoothstep(0.726, 0.738, z)) * lib.smoothstep(0.700, 0.710, z)
            c = lib.lerp3(c, (0.09, 0.025, 0.02), min(1.0, k * 1.2))
        # blush na fronteira laranja/creme (círculos rosados bem visíveis)
        blush_phi = 0.86
        if y < 0 and 0.70 < z < 0.87:
            for sx in (1, -1):
                dphi = (phi - blush_phi) if (x * sx > 0) else 10
                d = math.sqrt((dphi * 0.24) ** 2 + ((z - 0.785) * 1.1) ** 2)
                if d < 0.075:
                    c = lib.lerp3(c, BLUSH[:3], (1 - d / 0.075) * 0.95)
        return (c[0], c[1], c[2], 1.0)

    lib.paint(obj, color)


# ------------------------------------------------------------------ membros

def limb(name, p0, p1, radii, mat, bend=0.0, n=12):
    """Loft entre p0→p1 com raios por anel; bend curva no meio (eixo -y)."""
    rings = []
    steps = len(radii)
    for i, r in enumerate(radii):
        t = i / (steps - 1)
        x = p0[0] + (p1[0] - p0[0]) * t
        y = p0[1] + (p1[1] - p0[1]) * t + math.sin(t * math.pi) * bend
        z = p0[2] + (p1[2] - p0[2]) * t
        rings.append(lib.ring(z, r, r * 0.92, n=n, cy=y))
    # centraliza x por anel (loft vertical com deslocamento)
    out = []
    for i, ringpts in enumerate(rings):
        t = i / (steps - 1)
        cx = p0[0] + (p1[0] - p0[0]) * t
        out.append([(px + cx, py, pz) for px, py, pz in ringpts])
    return lib.loft_mesh(name, out, material=mat, subdiv=2)


def hand_shape(th):
    """3 dedinhos na frente da patinha."""
    f = frontness(th)
    fingers = 1 + 0.10 * f * max(0.0, math.cos(3 * math.acos(max(-1, min(1, math.cos(th))))))
    return fingers


def build_limbs(mat):
    parts = []
    # braços fininhos saindo do ombro, mãozinha redonda na ponta
    for sx, nm in ((1, 'armL2'), (-1, 'armR2')):
        arm = limb(nm, (sx * 0.185, -0.045, 0.46), (sx * 0.26, -0.10, 0.27),
                   [0.045, 0.048, 0.046, 0.05, 0.068], mat, bend=-0.015)
        parts.append(arm)
    # pernas gordinhas: quadril → pé digitígrado maior
    for sx, nm in ((1, 'legL2'), (-1, 'legR2')):
        leg = limb(nm, (sx * 0.11, 0.0, 0.14), (sx * 0.12, -0.02, 0.05),
                   [0.09, 0.086, 0.082, 0.088], mat)
        foot = limb(nm + '_foot', (sx * 0.12, -0.04, 0.055), (sx * 0.125, -0.13, 0.05),
                    [0.082, 0.09, 0.07], mat)
        parts += [leg, foot]
    return parts


def paint_limb(obj, hand_z_below=None):
    def color(co):
        c = ORANGE[:3]
        if hand_z_below is not None and co.z < hand_z_below:
            c = CHOCO[:3]
        return (c[0], c[1], c[2], 1.0)
    lib.paint(obj, color)


# ------------------------------------------------------------------ cauda (S com tufo)

TAIL_PATH = [
    # (x, y, z, raio) — plumão em S espiando pelo lado dela (+x)
    (0.02, 0.15, 0.20, 0.08),
    (0.07, 0.27, 0.27, 0.125),
    (0.13, 0.345, 0.38, 0.165),
    (0.19, 0.365, 0.52, 0.175),
    (0.25, 0.355, 0.66, 0.15),
    (0.30, 0.33, 0.78, 0.11),
    (0.33, 0.31, 0.87, 0.06),
]


def build_tail(mat):
    rings = []
    for x, y, z, r in TAIL_PATH:
        # anéis levemente achatados na direção do caminho (aprox vertical)
        rings.append([(px + x, py + y, pz) for px, py, pz in lib.ring(z, r, r * 0.9, n=14)])
    return lib.loft_mesh('tail2', rings, material=mat, subdiv=2)


def paint_tail(obj):
    def color(co):
        t = lib.smoothstep(0.66, 0.84, co.z)  # ponta creme
        c = lib.lerp3(ORANGE[:3], CREAM[:3], t)
        return (c[0], c[1], c[2], 1.0)
    lib.paint(obj, color)


# ------------------------------------------------------------------ orelhas

def build_ears(mat):
    parts = []
    for sx, nm in ((1, 'earL2'), (-1, 'earR2')):
        rings = []
        base = (sx * 0.16, 0.015, 1.06)
        tip = (sx * 0.26, 0.05, 1.38)
        radii = [0.105, 0.09, 0.062, 0.03, 0.008]
        for i, r in enumerate(radii):
            t = i / (len(radii) - 1)
            cx = base[0] + (tip[0] - base[0]) * t
            cy = base[1] + (tip[1] - base[1]) * t
            cz = base[2] + (tip[2] - base[2]) * t
            rings.append([(px * 1.0 + cx, py * 0.45 + cy, pz + cz)
                          for px, py, pz in lib.ring(0, r, r, n=12)])
        parts.append(lib.loft_mesh(nm, rings, material=mat, subdiv=2))
    return parts


def paint_ear(obj):
    def color(co):
        # ponta escura + frente rosinha
        t = lib.smoothstep(1.22, 1.34, co.z)
        c = lib.lerp3(ORANGE[:3], CHOCO[:3], t)
        if co.y < 0.0 and co.z < 1.24:
            c = lib.lerp3(c, PINK[:3], 0.7)
        return (c[0], c[1], c[2], 1.0)
    lib.paint(obj, color)


# ------------------------------------------------------------------ olhos v2

def build_eyes():
    iris_mat = lib.make_iris_material()
    white = lib.mat('EyeWhite', '#FFFFFF', roughness=0.25)
    eyes = {}
    for side, sx in (('L', 1), ('R', -1)):
        ball = lib.sphere(f'eyeball2_{side}', 0.066, (sx * 0.115, -0.235, 0.895),
                          scale=(1, 0.55, 1), material=white, group=f'eye{side}')
        iris = lib.iris_disc(f'iris_{side}', 0.052,
                             (sx * 0.115, -0.235 - 0.066 * 0.55 - 0.002, 0.895),
                             iris_mat, group=f'eye{side}')
        eyes[side] = lib.join([ball, iris], f'Eye{side}')
    return eyes


# ------------------------------------------------------------------ build F1/F2

# ------------------------------------------------------------------ boca v2 (F3)

def build_mouth(fur):
    """Queixo articulado + interior escuro + dentinhos + língua."""
    jaw = lib.sphere('jaw2', 0.105, (0, -0.27, 0.712), scale=(1.15, 0.85, 0.5),
                     material=fur, group='jaw')
    lib.paint(jaw, lambda co: CREAM)
    interior = lib.sphere('mouth_in2', 0.10, (0, -0.26, 0.716), scale=(0.95, 0.6, 0.58),
                          material=lib.mat('MouthDark', '#5A2A28'), group='head')
    tongue = lib.sphere('tongue2', 0.052, (0, -0.25, 0.712), scale=(1.0, 1.7, 0.42),
                        material=lib.mat('TonguePink', '#FF8FA3', roughness=0.6),
                        group='tongue')
    # dentinhos: caninos superiores (head) + inferiores (jaw), mesh própria 'Teeth'
    white = lib.mat('ToothWhite', '#FFFFFF', roughness=0.3)
    teeth_parts = []
    for sx in (1, -1):
        teeth_parts.append(lib.cone(f'tooth_up_{sx}', 0.016, 0.002, 0.038,
                                    (sx * 0.05, -0.338, 0.733), rot=(math.pi, 0, 0),
                                    material=white, group='head', vertices=8))
        teeth_parts.append(lib.cone(f'tooth_dn_{sx}', 0.012, 0.002, 0.028,
                                    (sx * 0.034, -0.315, 0.698),
                                    material=white, group='jaw', vertices=8))
    teeth = lib.join(teeth_parts, 'Teeth')
    return jaw, interior, tongue, teeth


# ------------------------------------------------------------------ pálpebras/sobrancelhas (F3)

def build_lids(fur):
    """Cúpulas orientadas pra frente, giradas pra cima em repouso (abertas).
    Fechar = osso lid gira pra baixo cobrindo o olho."""
    lids = []
    for side, sx in (('L', 1), ('R', -1)):
        center = (sx * 0.115, -0.235, 0.895)
        rings = []
        # calota frontal: anéis perpendiculares ao eixo -y
        for a_deg in (86, 64, 42, 20, 6):
            a = D(a_deg)
            r = 0.075 * math.sin(a)
            yoff = -0.075 * math.cos(a)
            ring_pts = [(center[0] + math.cos(t / 12 * TAU) * r,
                         center[1] + yoff * 0.75,
                         center[2] + math.sin(t / 12 * TAU) * r) for t in range(12)]
            rings.append(ring_pts)
        lid = lib.loft_mesh(f'lid{side}', rings, material=fur, group=f'lid{side}',
                            close_bottom=False, close_top=True, subdiv=1)
        # em repouso: girada BEM pra cima (escondida atrás da testa) = olho aberto
        lid.location = center
        for v in lid.data.vertices:
            v.co.x -= center[0]
            v.co.y -= center[1]
            v.co.z -= center[2]
        lid.rotation_euler = (D(-172), 0, 0)
        lib.paint(lid, lambda co: ORANGE)
        lids.append(lid)
    return lids


def build_brows(fur):
    brows = []
    dark = lib.mat('BrowDark', '#8A4A1E', roughness=0.9)
    for side, sx in (('L', 1), ('R', -1)):
        b = lib.box(f'brow{side}', (0.062, 0.015, 0.018), (sx * 0.112, -0.252, 0.958),
                    material=dark, bevel=0.009, rot=(D(-22), 0, D(8 * sx)))
        vg = b.vertex_groups.new(name=f'brow{side}')
        vg.add(list(range(len(b.data.vertices))), 1.0, 'REPLACE')
        brows.append(b)
    return brows


# ------------------------------------------------------------------ rig v2 (F4)

BONES2 = {
    'root':     ((0, 0, 0.0), (0, 0, 0.10), None),
    'spine':    ((0, 0, 0.12), (0, 0, 0.30), 'root'),
    'chest':    ((0, 0, 0.30), (0, 0, 0.50), 'spine'),
    'neck':     ((0, 0, 0.50), (0, 0, 0.60), 'chest'),
    'head':     ((0, 0, 0.60), (0, 0, 1.0), 'neck'),
    'jaw':      ((0, -0.06, 0.755), (0, -0.30, 0.705), 'head'),
    'earL':     ((0.16, 0.015, 1.05), (0.26, 0.05, 1.36), 'head'),
    'earR':     ((-0.16, 0.015, 1.05), (-0.26, 0.05, 1.36), 'head'),
    'eyeL':     ((0.115, -0.20, 0.895), (0.115, -0.28, 0.895), 'head'),
    'eyeR':     ((-0.115, -0.20, 0.895), (-0.115, -0.28, 0.895), 'head'),
    'lidL':     ((0.115, -0.235, 0.895), (0.115, -0.31, 0.895), 'head'),
    'lidR':     ((-0.115, -0.235, 0.895), (-0.115, -0.31, 0.895), 'head'),
    'browL':    ((0.115, -0.245, 0.972), (0.115, -0.30, 0.985), 'head'),
    'browR':    ((-0.115, -0.245, 0.972), (-0.115, -0.30, 0.985), 'head'),
    'tongue':   ((0, -0.20, 0.712), (0, -0.30, 0.700), 'jaw'),
    'armL':     ((0.185, -0.045, 0.48), (0.26, -0.10, 0.27), 'chest'),
    'armR':     ((-0.185, -0.045, 0.48), (-0.26, -0.10, 0.27), 'chest'),
    'legL':     ((0.11, 0, 0.15), (0.12, -0.06, 0.05), 'root'),
    'legR':     ((-0.11, 0, 0.15), (-0.12, -0.06, 0.05), 'root'),
    'tailBase': ((0, 0.14, 0.24), (0.10, 0.32, 0.36), 'spine'),
    'tailMid':  ((0.10, 0.32, 0.36), (0.21, 0.36, 0.58), 'tailBase'),
    'tailTip':  ((0.21, 0.36, 0.58), (0.33, 0.31, 0.88), 'tailMid'),
}


def build_v2():
    fur = lib.mat_vcol('FurV2', roughness=0.85)
    core = build_core(fur)
    paint_core(core)
    # pesos por altura na malha única (rampas suaves nas fronteiras)
    lib.weight_bands(core, [
        ('root', -0.1, 0.18),
        ('spine', 0.18, 0.40),
        ('chest', 0.40, 0.545),
        ('neck', 0.545, 0.615),
        ('head', 0.615, 1.3),
    ])

    limbs = build_limbs(fur)
    limb_group = {'armL2': 'armL', 'armR2': 'armR', 'legL2': 'legL', 'legR2': 'legR',
                  'legL2_foot': 'legL', 'legR2_foot': 'legR'}
    for lm in limbs:
        paint_limb(lm, hand_z_below=0.36 if 'arm' in lm.name else 0.062)
        vg = lm.vertex_groups.new(name=limb_group[lm.name])
        vg.add(list(range(len(lm.data.vertices))), 1.0, 'REPLACE')

    tail = build_tail(fur)
    paint_tail(tail)
    lib.weight_bands(tail, [
        ('tailBase', 0.0, 0.40),
        ('tailMid', 0.40, 0.62),
        ('tailTip', 0.62, 1.2),
    ], blend=0.05)

    ears = build_ears(fur)
    for e, grp in zip(ears, ('earL', 'earR')):
        paint_ear(e)
        vg = e.vertex_groups.new(name=grp)
        vg.add(list(range(len(e.data.vertices))), 1.0, 'REPLACE')

    nose = lib.sphere('nose2', 0.033, (0, -0.425, 0.815), scale=(1.2, 0.6, 0.8),
                      material=lib.mat('NoseDark', '#4A2E24'), group='head')

    jaw, interior, tongue, teeth = build_mouth(fur)
    lids = build_lids(fur)
    brows = build_brows(fur)
    eyes = build_eyes()

    body = lib.join([core, *limbs, tail, *ears, nose, jaw, interior, tongue,
                     *lids, *brows], 'Jujuba')

    # ---- armature + skinning ----
    arm = lib.build_armature('JujubaRig', BONES2)
    for obj in (body, teeth, eyes['L'], eyes['R']):
        lib.skin(obj, arm)

    # ---- shape keys (depois de TODOS os joins) ----
    def smile(co):
        if co.y < -0.20 and 0.69 < co.z < 0.76 and 0.055 < abs(co.x) < 0.15:
            t = min(1.0, (abs(co.x) - 0.055) / 0.06)
            return (0, 0, 0.016 * t)
        return None

    def sad(co):
        if co.y < -0.20 and 0.69 < co.z < 0.76 and 0.055 < abs(co.x) < 0.15:
            t = min(1.0, (abs(co.x) - 0.055) / 0.06)
            return (0, 0, -0.014 * t)
        return None

    def cheek_puff(co):
        if co.y < -0.1 and 0.70 < co.z < 0.84 and 0.14 < abs(co.x) < 0.30:
            k = (1 - abs(co.z - 0.77) / 0.07)
            return (0.03 * (1 if co.x > 0 else -1) * max(0, k), -0.012 * max(0, k), 0)
        return None

    lib.add_shape_key(body, 'smile', smile)
    lib.add_shape_key(body, 'sad', sad)
    lib.add_shape_key(body, 'cheekPuff', cheek_puff)

    return body, teeth, eyes, arm


def previews(body, arm):
    lib.setup_render(res=(640, 768))
    cam = lib.add_preview_rig()
    mid = (0, 0, 0.58)
    lib.render_shot(cam, 'v2_front', (0, -2.6, 0.78), mid)
    lib.render_shot(cam, 'v2_threequarter', (1.75, -2.05, 0.9), mid)
    lib.render_shot(cam, 'v2_side', (2.6, 0, 0.78), mid)
    lib.render_shot(cam, 'v2_face', (0, -1.05, 0.92), (0, 0, 0.87))

    # expressões: sorriso + pálpebras fechadas (fechar = girar de volta ~104°)
    lib.set_shape(body, 'smile', 1.0)
    lib.pose_bone(arm, 'lidL', (-128, 0, 0))
    lib.pose_bone(arm, 'lidR', (-128, 0, 0))
    lib.render_shot(cam, 'v2_happy', (0, -1.05, 0.92), (0, 0, 0.87))
    lib.set_shape(body, 'smile', 0.0)
    lib.pose_bone(arm, 'lidL', (0, 0, 0))
    lib.pose_bone(arm, 'lidR', (0, 0, 0))

    # boca aberta: interior + dentinhos + língua
    lib.pose_bone(arm, 'jaw', (32, 0, 0))
    lib.render_shot(cam, 'v2_jawopen', (0, -1.05, 0.92), (0, 0, 0.87))
    lib.pose_bone(arm, 'jaw', (0, 0, 0))


if __name__ == '__main__':
    lib.reset_scene()
    body, teeth, eyes, arm = build_v2()
    lib.export_glb(os.path.join(lib.MODELS_DIR, 'jujuba.glb'), images=True)
    previews(body, arm)
    lib.log('V2 COMPLETA OK')
