"""Comidinhas da Jujuba: biscoito, maçã e coxa de frango.

Cada uma vira um .glb próprio (public/models/) + um ícone PNG transparente
256px pra bandeja (public/icons/food-*.png). Tamanhos ~da boca da raposa.
"""

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

D = math.radians


def build_cookie():
    m_dough = lib.mat('CookieDough', '#E0A96A', roughness=0.95)
    m_chip = lib.mat('CookieChip', '#4A2E24', roughness=0.8)
    parts = []
    import bpy
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.085, depth=0.032,
                                        location=(0, 0, 0))
    base = bpy.context.active_object
    base.scale = (1, 1, 1)
    lib._finish(base, 'cookie_base', m_dough, None)
    parts.append(base)
    chips = [(0.03, 0.02, 0.018), (-0.035, 0.028, 0.018), (-0.01, -0.045, 0.018),
             (0.048, -0.028, 0.018), (-0.052, -0.012, 0.018), (0.005, 0.052, 0.018)]
    for i, pos in enumerate(chips):
        parts.append(lib.sphere(f'chip_{i}', 0.013, pos, material=m_chip,
                                segments=10, rings=8))
    return lib.join(parts, 'Cookie')


def build_apple():
    m_red = lib.mat('AppleRed', '#FF5347', roughness=0.35)
    m_stem = lib.mat('AppleStem', '#7A4A2E', roughness=0.9)
    m_leaf = lib.mat('AppleLeaf', '#6FBF56', roughness=0.7)
    parts = [
        lib.sphere('apple_body', 0.085, (0, 0, 0), scale=(1, 1, 0.92), material=m_red),
    ]
    import bpy
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.008, depth=0.05,
                                        location=(0, 0, 0.095))
    stem = bpy.context.active_object
    stem.rotation_euler = (D(8), 0, 0)
    lib._finish(stem, 'stem', m_stem, None)
    parts.append(stem)
    parts.append(lib.sphere('leaf', 0.028, (0.025, -0.01, 0.105),
                            scale=(1, 0.45, 0.28), rot=(0, D(20), D(30)),
                            material=m_leaf, segments=12, rings=8))
    return lib.join(parts, 'Apple')


def build_drumstick():
    m_meat = lib.mat('MeatBrown', '#C27A3F', roughness=0.85)
    m_bone = lib.mat('BoneCream', '#FFF3E3', roughness=0.9)
    parts = [
        # carne: gota (esfera esticada)
        lib.sphere('meat', 0.075, (0, 0, 0.03), scale=(1, 0.9, 1.35), material=m_meat),
    ]
    import bpy
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.016, depth=0.09,
                                        location=(0, 0, -0.10))
    bone = bpy.context.active_object
    lib._finish(bone, 'bone', m_bone, None)
    parts.append(bone)
    parts.append(lib.sphere('knob_l', 0.02, (-0.018, 0, -0.148), material=m_bone,
                            segments=10, rings=8))
    parts.append(lib.sphere('knob_r', 0.02, (0.018, 0, -0.148), material=m_bone,
                            segments=10, rings=8))
    return lib.join(parts, 'Drumstick')


FOODS = {
    'cookie': build_cookie,
    'apple': build_apple,
    'drumstick': build_drumstick,
}

if __name__ == '__main__':
    import bpy
    for name, build in FOODS.items():
        lib.reset_scene()
        build()
        lib.export_glb(os.path.join(lib.MODELS_DIR, f'{name}.glb'), min_bytes=2_000)
        # ícone transparente pra bandeja
        lib.setup_render(res=(256, 256), transparent=True)
        cam = lib.add_preview_rig()
        os.makedirs(lib.ICONS_DIR, exist_ok=True)
        lib.render_shot(cam, f'food-{name}', (0.28, -0.34, 0.22), (0, 0, 0.0),
                        out_dir=lib.ICONS_DIR)
    lib.log('FOODS OK')
