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


def build_brush_set():
    """Set da escovação: pia grandona na frente (esconde a parte de baixo dela)
    + espelho arredondado atrás emoldurando a cabeça."""
    M = mats()
    parts = [
        # bancada/pia na frente
        lib.box('sink_counter', (1.05, 0.55, 0.42), (0, -0.18, 0.24), material=M['white'],
                bevel=0.05),
        lib.sphere('sink_bowl', 0.30, (0, -0.22, 0.48), scale=(1.15, 0.75, 0.28),
                   material=lib.mat('BowlInner', '#DFF0F2', roughness=0.3)),
        lib.cylinder('sink_faucet', 0.028, 0.22, (0.32, -0.30, 0.58), material=M['metal']),
        lib.cylinder('sink_spout', 0.022, 0.14, (0.32, -0.38, 0.66), material=M['metal'],
                     rot=(D(90), 0, 0)),
        # espelho atrás (moldura + vidro)
        lib.box('mirror_frame', (0.98, 0.06, 0.78), (0, 0.5, 1.02), material=M['white'],
                bevel=0.04),
        lib.box('mirror_glass', (0.86, 0.03, 0.66), (0, 0.47, 1.02),
                material=lib.mat('MirrorBlue', '#CBE9F2', roughness=0.05), bevel=0.02),
        # copinho + pasta na bancada
        lib.cylinder('cup', 0.055, 0.12, (-0.38, -0.3, 0.51),
                     material=lib.mat('CupMint', '#A8E6D5', roughness=0.5)),
        lib.box('paste', (0.16, 0.05, 0.05), (0.05, -0.34, 0.47),
                material=lib.mat('PasteRed', '#FF6B6B', roughness=0.5), bevel=0.02),
    ]
    for sx in (1, -1):
        for sy in (1, -1):
            parts.append(lib.sphere(f'sink_foot_{sx}_{sy}', 0.055,
                                    (sx * 0.44, -0.18 + sy * 0.2, 0.05),
                                    material=M['gold'], segments=12, rings=8))
    lib.join(parts, 'BrushSet')


def build_toothbrush():
    """Escova de dente chunky que segue o dedo na escovação (deitada no +x,
    cerdas pra cima; o jogo rotaciona pra apontar as cerdas nos dentes)."""
    pink = lib.mat('BrushPink', '#FF8FB3', roughness=0.5)
    white = lib.mat('BrushWhite', '#FFFFFF', roughness=0.4)
    bristle = lib.mat('BrushBristle', '#D8F2FF', roughness=0.8)
    parts = [
        lib.box('handle', (0.20, 0.045, 0.035), (-0.07, 0, 0), material=pink,
                bevel=0.015),
        lib.box('neck', (0.08, 0.03, 0.025), (0.055, 0, 0.004), material=pink,
                bevel=0.01),
        lib.box('head', (0.09, 0.04, 0.028), (0.115, 0, 0.008), material=white,
                bevel=0.012),
        lib.box('bristles', (0.082, 0.032, 0.03), (0.115, 0, 0.036),
                material=bristle, bevel=0.008),
    ]
    lib.join(parts, 'Toothbrush')


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

    lib.reset_scene()
    build_brush_set()
    lib.export_glb(os.path.join(lib.MODELS_DIR, 'brush-set.glb'), min_bytes=2_000)
    lib.setup_render(res=(640, 500))
    cam = lib.add_preview_rig()
    lib.render_shot(cam, 'brush-set', (0, -2.6, 0.95), (0, 0, 0.5))

    lib.reset_scene()
    build_toothbrush()
    lib.export_glb(os.path.join(lib.MODELS_DIR, 'toothbrush.glb'), min_bytes=1_000)
    lib.setup_render(res=(512, 380))
    cam = lib.add_preview_rig()
    lib.render_shot(cam, 'toothbrush', (0, -0.7, 0.35), (0.02, 0, 0.01))
    lib.log('BATHROOM OK')
