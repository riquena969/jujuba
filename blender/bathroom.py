"""Banheiro da raposinha: sala (banheira + pia) e o set de banho em close.

- room-banheiro.glb: banheira à esquerda e pia à direita, como props de fundo.
  Banheira e pia ficam em MESHES SEPARADAS ('Tub' e 'Sink') pro jogo dar
  raycast direto na banheira (tocar nela entra no modo banho).
- bath-set.glb: banheirão centrado que envolve a raposa (parede da frente
  esconde as perninhas), superfície d'água na altura da barriga e espumas
  bakeadas na borda.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

D = math.radians


def mats():
    return {
        'white': lib.mat('TubWhite', '#FFFFFF', roughness=0.35),
        'water': lib.mat('WaterBlue', '#8FD9EC', roughness=0.12),
        'gold': lib.mat('FeetGold', '#E8C36A', roughness=0.4),
        'metal': lib.mat('FaucetMetal', '#B8C4C9', roughness=0.25),
        'foam': lib.mat('FoamWhite', '#FDFEFF', roughness=0.9),
    }


def build_room():
    M = mats()
    # ---- banheira (esquerda, mais pra dentro pra aparecer no portrait) ----
    tx, ty = -0.55, 1.65
    tub_parts = [
        lib.box('tub_body', (0.8, 0.5, 0.4), (tx, ty, 0.3), material=M['white'],
                bevel=0.05),
        lib.box('tub_rim', (0.88, 0.58, 0.07), (tx, ty, 0.52), material=M['white'],
                bevel=0.03),
        lib.box('tub_water', (0.66, 0.38, 0.04), (tx, ty, 0.5), material=M['water'],
                bevel=0.015),
    ]
    for sx in (1, -1):
        for sy in (1, -1):
            tub_parts.append(lib.sphere(f'tub_foot_{sx}_{sy}', 0.05,
                                        (tx + sx * 0.34, ty + sy * 0.2, 0.05),
                                        material=M['gold'], segments=12, rings=8))
    lib.join(tub_parts, 'Tub')

    # ---- pia (direita) ----
    sink_parts = [
        lib.cylinder('sink_pedestal', 0.09, 0.5, (0.72, 1.55, 0.25), material=M['white']),
        lib.sphere('sink_basin', 0.2, (0.72, 1.55, 0.55), scale=(1, 1, 0.45),
                   material=M['white']),
        lib.cylinder('faucet_up', 0.024, 0.2, (0.72, 1.66, 0.66), material=M['metal']),
        lib.cylinder('faucet_out', 0.02, 0.12, (0.72, 1.6, 0.74), material=M['metal'],
                     rot=(D(90), 0, 0)),
    ]
    lib.join(sink_parts, 'Sink')


def build_bath_set():
    M = mats()
    parts = [
        # banheirão centrado — parede da frente esconde a parte de baixo dela
        lib.box('bath_body', (1.0, 0.78, 0.5), (0, 0.05, 0.28), material=M['white'],
                bevel=0.06),
        lib.box('bath_rim', (1.08, 0.86, 0.08), (0, 0.05, 0.55), material=M['white'],
                bevel=0.035),
        # água inclinada pra câmera (senão a borda esconde ela na visão do jogo)
        lib.box('bath_water', (0.9, 0.7, 0.03), (0, 0.02, 0.51), material=M['water'],
                bevel=0.012, rot=(-D(12), 0, 0)),
    ]
    for sx in (1, -1):
        for sy in (1, -1):
            parts.append(lib.sphere(f'bath_foot_{sx}_{sy}', 0.06,
                                    (sx * 0.42, 0.05 + sy * 0.3, 0.05),
                                    material=M['gold'], segments=12, rings=8))
    # espumão espiando por cima da borda (banho de espuma!)
    foams = [(0.36, -0.2, 0.1), (-0.38, -0.18, 0.085), (0.3, 0.22, 0.09),
             (-0.32, 0.24, 0.1), (0.06, 0.3, 0.08), (-0.14, -0.28, 0.075),
             (0.46, 0.05, 0.07), (-0.47, 0.03, 0.075), (0.18, -0.3, 0.065)]
    for i, (x, y, r) in enumerate(foams):
        parts.append(lib.sphere(f'foam_{i}', r, (x, 0.05 + y, 0.6),
                                scale=(1, 1, 0.75), material=M['foam'],
                                segments=14, rings=10))
    lib.join(parts, 'BathSet')


if __name__ == '__main__':
    lib.reset_scene()
    build_room()
    lib.export_glb(os.path.join(lib.MODELS_DIR, 'room-banheiro.glb'), min_bytes=2_000)
    lib.setup_render(res=(640, 500))
    cam = lib.add_preview_rig()
    lib.render_shot(cam, 'room-banheiro', (0, -3.2, 1.1), (0, 1.2, 0.45))

    lib.reset_scene()
    build_bath_set()
    lib.export_glb(os.path.join(lib.MODELS_DIR, 'bath-set.glb'), min_bytes=2_000)
    lib.setup_render(res=(640, 500))
    cam = lib.add_preview_rig()
    lib.render_shot(cam, 'bath-set', (0, -2.6, 0.95), (0, 0, 0.35))
    lib.log('BATHROOM OK')
