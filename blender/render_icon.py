"""Ícones do app (PWA + apple-touch) — closeup da carinha da Jujuba.

Fundo sólido pastel (iOS ignora transparência em ícone). Gera:
public/icons/icon-512.png, icon-192.png, icon-180.png
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
import jujuba2  # noqa: E402

if __name__ == '__main__':
    import bpy

    body, teeth, eyes, arm = jujuba2.build_v2()
    # sorrisinho leve pro ícone
    lib.set_shape(body, 'smile', 0.6)

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
        lib.render_shot(cam, f'icon-{size}', (0, -0.92, 0.94), (0, 0, 0.88),
                        out_dir=lib.ICONS_DIR)
    lib.log('ICONS OK')
