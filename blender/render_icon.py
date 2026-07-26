"""Ícones do app (PWA + apple-touch) — closeup da carinha da Jujuba.

Fundo sólido pastel (iOS ignora transparência em ícone). Gera:
public/icons/icon-512.png, icon-192.png, icon-180.png
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
import jujuba_v3  # noqa: E402

if __name__ == '__main__':
    import bpy

    body, eye_sets, teeth, tongue, arm, ref = jujuba_v3.build()
    # sorrisinho leve pro ícone; só o par de olhos padrão aparece
    lib.set_shape(body, 'smile', 0.6)
    for style, sides in eye_sets.items():
        for o in sides.values():
            o.hide_render = style != 'large'

    cam = None
    for size in (512, 192, 180):
        lib.setup_render(res=(size, size), view_transform='Standard')
        s = bpy.context.scene
        # fundo do ícone: pêssego sólido
        bg = s.world.node_tree.nodes['Background']
        bg.inputs[0].default_value = lib.hex_rgba('#FFE3C7')
        bg.inputs[1].default_value = 1.0
        if cam is None:
            cam = lib.add_preview_rig()
        fz = ref['eyeL'].z - 0.04
        lib.render_shot(cam, f'icon-{size}', (0, -0.95, fz + 0.06), (0, 0, fz),
                        out_dir=lib.ICONS_DIR)
    lib.log('ICONS OK')
