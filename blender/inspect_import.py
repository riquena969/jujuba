"""Inspeção de modelo importado (uso: blender -b --factory-startup --python
blender/inspect_import.py -- <arquivo.gltf>): lista objetos/materiais/bbox e
renderiza previews cruas pra avaliar o que veio no download."""

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

src = sys.argv[sys.argv.index('--') + 1]

lib.reset_scene()
bpy.ops.import_scene.gltf(filepath=src)

# aplica transform da hierarquia pra medir em coordenadas de mundo
deps = bpy.context.evaluated_depsgraph_get()

lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
print('[inspect] === objetos ===', flush=True)
for o in bpy.data.objects:
    if o.type == 'MESH':
        me = o.evaluated_get(deps).to_mesh()
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        mats = [m.name if m else '?' for m in o.data.materials]
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        blo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        bhi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        for i in range(3):
            lo[i] = min(lo[i], blo[i])
            hi[i] = max(hi[i], bhi[i])
        print(f'[inspect] {o.name:14s} tris={tris:8d} mats={mats} '
              f'bbox=({blo.x:.3f},{blo.y:.3f},{blo.z:.3f})..({bhi.x:.3f},{bhi.y:.3f},{bhi.z:.3f})',
              flush=True)
    elif o.type == 'ARMATURE':
        print(f'[inspect] ARMATURE {o.name}: {len(o.data.bones)} ossos', flush=True)

print(f'[inspect] BBOX TOTAL: ({lo.x:.3f},{lo.y:.3f},{lo.z:.3f}) .. ({hi.x:.3f},{hi.y:.3f},{hi.z:.3f})', flush=True)
size = hi - lo
print(f'[inspect] tamanho: x={size.x:.3f} y={size.y:.3f} z={size.z:.3f}', flush=True)

# previews cruas (na escala/orientação em que veio)
lib.setup_render(res=(640, 768))
cam = lib.add_preview_rig()
c = (lo + hi) / 2
d = max(size.x, size.y, size.z) * 2.2
lib.render_shot(cam, 'import_front', (c.x, c.y - d, c.z + size.z * 0.1), tuple(c))
lib.render_shot(cam, 'import_back', (c.x, c.y + d, c.z + size.z * 0.1), tuple(c))
lib.render_shot(cam, 'import_side', (c.x + d, c.y, c.z), tuple(c))
lib.log('INSPECT OK')
