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

    # ---- assoprador de bolhas (direita, mais à frente = fácil de tocar) ----
    soap = lib.mat('SoapBlue', '#5EC8E8', roughness=0.35)
    bucket_in = lib.mat('SoapFoam', '#DFF6FF', roughness=0.6)
    wand = lib.mat('WandPink', '#FF8FB3', roughness=0.5)
    parts = [
        lib.cylinder('bucket', 0.16, 0.24, (0.66, 1.15, 0.12), material=soap),
        lib.cylinder('bucket_soap', 0.14, 0.03, (0.66, 1.15, 0.245), material=bucket_in),
        # varinha inclinada com aro
        lib.cylinder('wand_stick', 0.018, 0.34, (0.56, 1.08, 0.38), material=wand,
                     rot=(D(-18), D(24), 0)),
    ]
    import bpy
    bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.014,
                                     location=(0.47, 1.0, 0.55),
                                     rotation=(D(66), 0, D(24)))
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
