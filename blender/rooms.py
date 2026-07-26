"""Props das salas da Jujuba: cozinha, sala de estar e quarto.

Estilo: caixas chunky com bevel + esferas, cores pastel combinando com ela.
Os props ficam ATRÁS da raposa (Blender +y = fundo), levemente pros lados,
pra aparecerem na moldura portrait do celular sem cobrir a estrela.

Gera public/models/room-{cozinha,sala,quarto}.glb + previews.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

D = math.radians


def build_cozinha():
    cream = lib.mat('ApplianceCream', '#F5EFE3', roughness=0.6)
    dark = lib.mat('HandleDark', '#6B4632')
    wood = lib.mat('CounterWood', '#E3B788')
    top = lib.mat('CounterTop', '#FBEDD8')
    bowl = lib.mat('BowlRed', '#FF6B5E', roughness=0.4)
    parts = [
        # geladeira (à esquerda dela)
        lib.box('fridge', (0.56, 0.5, 1.08), (-0.68, 1.55, 0.54), material=cream, bevel=0.035),
        lib.cylinder('fridge_handle', 0.016, 0.34, (-0.46, 1.29, 0.72), material=dark,
                     rot=(D(90) * 0, 0, 0)),
        # balcão com tigela (à direita)
        lib.box('counter', (0.92, 0.52, 0.5), (0.78, 1.6, 0.25), material=wood, bevel=0.03),
        lib.box('counter_top', (1.0, 0.58, 0.06), (0.78, 1.6, 0.53), material=top, bevel=0.02),
        lib.sphere('bowl', 0.15, (0.66, 1.52, 0.6), scale=(1, 1, 0.55), material=bowl),
    ]
    return lib.join(parts, 'RoomCozinha')


def build_sala():
    sofa = lib.mat('SofaCoral', '#F2937E', roughness=0.85)
    cushion = lib.mat('CushionCream', '#FFF3E3', roughness=0.9)
    pot = lib.mat('PotTerracotta', '#C96F4A', roughness=0.8)
    leaf = lib.mat('LeafGreen', '#7FBF6A', roughness=0.7)
    parts = [
        # sofá (à direita, meio de lado)
        lib.box('sofa_base', (1.05, 0.55, 0.3), (0.74, 1.62, 0.15), material=sofa, bevel=0.04),
        lib.box('sofa_back', (1.05, 0.16, 0.5), (0.74, 1.85, 0.5), material=sofa, bevel=0.04),
        lib.box('sofa_arm_l', (0.16, 0.55, 0.42), (0.28, 1.62, 0.36), material=sofa, bevel=0.04),
        lib.box('sofa_arm_r', (0.16, 0.55, 0.42), (1.2, 1.62, 0.36), material=sofa, bevel=0.04),
        lib.box('sofa_cushion_l', (0.42, 0.48, 0.12), (0.53, 1.6, 0.36), material=cushion,
                bevel=0.035),
        lib.box('sofa_cushion_r', (0.42, 0.48, 0.12), (0.96, 1.6, 0.36), material=cushion,
                bevel=0.035),
        # plantinha (à esquerda)
        lib.cone('plant_pot', 0.19, 0.14, 0.3, (-0.75, 1.5, 0.15), material=pot),
        lib.sphere('leaf_1', 0.17, (-0.75, 1.5, 0.42), material=leaf),
        lib.sphere('leaf_2', 0.13, (-0.63, 1.55, 0.56), material=leaf),
        lib.sphere('leaf_3', 0.13, (-0.86, 1.47, 0.58), material=leaf),
        lib.sphere('leaf_4', 0.11, (-0.74, 1.42, 0.68), material=leaf),
    ]
    sala = lib.join(parts, 'RoomSala')

    # quadro pendurado (mesh SEPARADA 'Quadro' — tap nele abre os créditos):
    # moldura dourada + tela creme com um retratinho da raposinha
    frame_m = lib.mat('FrameGold', '#E8C36A', roughness=0.5)
    canvas_m = lib.mat('CanvasCream', '#FFF8EC', roughness=0.9)
    photo_m = lib.mat('PhotoOrange', '#F97B2F', roughness=0.8)
    tilt = (D(-8), 0, 0)  # levemente inclinado pra câmera
    q = [
        lib.box('quadro_frame', (0.44, 0.05, 0.36), (-0.6, 2.15, 1.5),
                material=frame_m, bevel=0.02, rot=tilt),
        lib.box('quadro_canvas', (0.37, 0.035, 0.29), (-0.6, 2.12, 1.5),
                material=canvas_m, bevel=0.012, rot=tilt),
        # retratinho: cabecinha + orelhinhas
        lib.sphere('quadro_fox', 0.085, (-0.6, 2.095, 1.48), scale=(1, 0.35, 0.9),
                   material=photo_m, rot=tilt),
        lib.cone('quadro_ear_l', 0.035, 0.006, 0.09, (-0.545, 2.1, 1.575),
                 scale=(1, 0.35, 1), rot=(D(-8), D(18), 0), material=photo_m),
        lib.cone('quadro_ear_r', 0.035, 0.006, 0.09, (-0.655, 2.1, 1.575),
                 scale=(1, 0.35, 1), rot=(D(-8), D(-18), 0), material=photo_m),
    ]
    lib.join(q, 'Quadro')
    return sala


def build_quarto():
    wood = lib.mat('BedWood', '#C99568', roughness=0.8)
    mattress = lib.mat('MattressCream', '#FFF6EA', roughness=0.9)
    pillow = lib.mat('PillowWhite', '#FFFFFF', roughness=0.95)
    blanket = lib.mat('BlanketLavender', '#B9A7E8', roughness=0.9)
    shade = lib.mat('LampWarm', '#FFD9A0', roughness=0.5)
    parts = [
        # cama (à esquerda, comprimento indo pro fundo)
        lib.box('bed_head', (0.74, 0.08, 0.6), (-0.66, 2.02, 0.3), material=wood, bevel=0.03),
        lib.box('bed_base', (0.7, 1.05, 0.2), (-0.66, 1.5, 0.1), material=wood, bevel=0.03),
        lib.box('mattress', (0.66, 1.0, 0.14), (-0.66, 1.5, 0.27), material=mattress,
                bevel=0.04),
        lib.box('pillow', (0.44, 0.26, 0.12), (-0.66, 1.85, 0.38), material=pillow, bevel=0.05),
        lib.box('blanket', (0.7, 0.55, 0.07), (-0.66, 1.22, 0.33), material=blanket,
                bevel=0.035),
        # criado-mudo + abajur (à direita)
        lib.box('nightstand', (0.32, 0.32, 0.34), (0.72, 1.55, 0.17), material=wood, bevel=0.03),
        lib.cylinder('lamp_base', 0.035, 0.16, (0.72, 1.55, 0.42), material=wood),
        lib.cone('lamp_shade', 0.13, 0.07, 0.16, (0.72, 1.55, 0.56), material=shade),
    ]
    return lib.join(parts, 'RoomQuarto')


ROOMS = {
    'cozinha': build_cozinha,
    'sala': build_sala,
    'quarto': build_quarto,
}

if __name__ == '__main__':
    for name, build in ROOMS.items():
        lib.reset_scene()
        build()
        lib.export_glb(os.path.join(lib.MODELS_DIR, f'room-{name}.glb'), min_bytes=2_000)
        lib.setup_render(res=(640, 500))
        cam = lib.add_preview_rig()
        lib.render_shot(cam, f'room-{name}', (0, -3.2, 1.1), (0, 1.2, 0.45))
    lib.log('ROOMS OK')
