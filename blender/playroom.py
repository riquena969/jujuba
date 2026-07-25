"""Sala de brinquedo: blocos coloridos + assoprador de bolhas de sabão.

O assoprador ('Blower') fica em mesh separada — é o alvo de raycast que inicia
o minigame das bolhas (e ganha brilho-convite pulsante no jogo).
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

D = math.radians


def build_playroom():
    # ---- pilha de blocos coloridos (esquerda) ----
    colors = [('BlockRed', '#FF6B6B'), ('BlockYellow', '#FFD166'),
              ('BlockTeal', '#4ECDC4'), ('BlockLilac', '#B39DDB')]
    mats = {n: lib.mat(n, h, roughness=0.7) for n, h in colors}
    toys = [
        lib.box('block_1', (0.26, 0.26, 0.26), (-0.72, 1.55, 0.13),
                material=mats['BlockRed'], bevel=0.025),
        lib.box('block_2', (0.26, 0.26, 0.26), (-0.44, 1.6, 0.13),
                material=mats['BlockYellow'], bevel=0.025),
        lib.box('block_3', (0.26, 0.26, 0.26), (-0.58, 1.57, 0.39),
                material=mats['BlockTeal'], bevel=0.025),
        lib.box('block_4', (0.24, 0.24, 0.24), (-0.85, 1.45, 0.12),
                material=mats['BlockLilac'], bevel=0.025, rot=(0, 0, D(22))),
    ]
    lib.join(toys, 'Toys')

    # ---- potinho de bolha de sabão (direita, silhueta única e conectada) ----
    # Pote com aro/tampa + varinha que SAI de dentro do sabão e termina no aro
    # de soprar — geometria calculada pra tudo se tocar (nada flutuando solto).
    soap = lib.mat('SoapBlue', '#5EC8E8', roughness=0.35)
    lip_m = lib.mat('SoapBlueDeep', '#3FA9D0', roughness=0.35)
    soap_in = lib.mat('SoapFoam', '#DFF6FF', roughness=0.6)
    wand = lib.mat('WandPink', '#FF8FB3', roughness=0.5)

    cx, cy = 0.38, 0.98  # dentro do frustum portrait (antes metade saía da tela)
    tilt = D(-14)  # varinha encostada na boca do pote, inclinada pra esquerda
    direc = (math.sin(tilt), 0.0, math.cos(tilt))
    p0 = (cx + 0.06, cy, 0.10)  # pé da varinha, mergulhado no sabão
    length = 0.5
    mid = tuple(p0[i] + direc[i] * length / 2 for i in range(3))
    top = tuple(p0[i] + direc[i] * length for i in range(3))
    ring_c = tuple(top[i] + direc[i] * 0.085 for i in range(3))  # aro tangencia a ponta

    parts = [
        lib.cylinder('jar', 0.15, 0.28, (cx, cy, 0.14), material=soap),
        lib.cylinder('jar_lip', 0.17, 0.045, (cx, cy, 0.30), material=lip_m),
        lib.cylinder('jar_soap', 0.14, 0.02, (cx, cy, 0.305), material=soap_in),
        lib.cylinder('wand_stick', 0.017, length, mid, material=wand,
                     rot=(0, tilt, 0)),
    ]
    import bpy
    # aro no plano XZ (normal -y = de frente pra câmera), coplanar com a varinha
    bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.016,
                                     location=ring_c, rotation=(D(90), 0, 0))
    ring = bpy.context.active_object
    lib._finish(ring, 'wand_ring', wand, None)
    parts.append(ring)
    lib.join(parts, 'Blower')


if __name__ == '__main__':
    lib.reset_scene()
    build_playroom()
    lib.export_glb(os.path.join(lib.MODELS_DIR, 'room-brinquedos.glb'), min_bytes=2_000)
    lib.setup_render(res=(640, 500))
    cam = lib.add_preview_rig()
    lib.render_shot(cam, 'room-brinquedos', (0, -3.2, 1.1), (0, 1.2, 0.45))
    lib.log('PLAYROOM OK')
