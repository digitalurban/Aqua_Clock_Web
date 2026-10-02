"""Build the self-contained preview page.

The vendored Riverscape modules cannot simply be concatenated: several declare
the same local names (plants.js has its own `random`, for instance), so in one
scope they collide. Each module is wrapped in its own function instead, taking
the namespace built so far and adding its exports to it — a three-line module
loader, in dependency order.
"""
import re, sys

ORDER = ['lod', 'math', 'water', 'foliage', 'stemplants', 'environment', 'broadleaf', 'plants']
EXPORT = re.compile(r'^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)', re.M)

ALL_EXPORTS = set()

def module(name):
    src = open(f'src/scene/riverscape/{name}.js').read()
    names = EXPORT.findall(src)
    imported = []
    for match in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*"[^"]*";', src, re.S):
        imported += [p.strip().split(' as ')[0] for p in match.group(1).split(',') if p.strip()]
    src = re.sub(r'^import[^;]*;.*\n', '', src, flags=re.M)
    src = re.sub(r'^export\s+', '', src, flags=re.M)
    # only destructure names another vendored module provides; anything else
    # (TEXTURES) is a top-level const in the bundle and must not be shadowed
    fromNs = sorted(set(imported) & ALL_EXPORTS)
    destructure = f'  const {{ {", ".join(fromNs)} }} = __ns;\n' if fromNs else ''
    return (
        f'/* ---- riverscape/{name}.js ---- */\n'
        f'(function (__ns) {{\n{destructure}{src}\n'
        f'  Object.assign(__ns, {{ {", ".join(names)} }});\n'
        f'}})(__ns);\n'
    )

textures = open('src/scene/textures.js').read()
textures = re.sub(r'^export\s+', '', textures, flags=re.M)

for name in ORDER:  # collect every vendored export before emitting anything
    ALL_EXPORTS.update(EXPORT.findall(open(f'src/scene/riverscape/{name}.js').read()))

bundle = ['const __ns = {};'] + [module(n) for n in ORDER]
# bubbles.js has its own top-level names (rand, clamp, VERT, FRAG) that would
# collide with the scene's in one module scope, so it goes in an IIFE
_bub = open('src/scene/bubbles.js').read()
_bub = re.sub(r'^import .*\n', '', _bub, flags=re.M)
_bub = _bub.replace('export function createBubbles', 'function createBubbles')
bundle.append('const createBubbles = (function () {\n' + _bub + '\nreturn createBubbles;\n})();')
bundle.append('const { createEnvironment, createParticles, createPlants, groundHeight,\n'
              '        SURFACE_Y, waterLitShader, waterTime, setLOD } = __ns;')
# snails.js has its own top-level names too, and needs waterLitShader, so it goes in an IIFE
# after the line above
_sn = open('src/scene/snails.js').read()
_sn = re.sub(r'^import .*\n', '', _sn, flags=re.M)
_sn = _sn.replace('export function createSnails', 'function createSnails')
bundle.append('const createSnails = (function () {\n' + _sn + '\nreturn createSnails;\n})();')

scene = open('src/scene/riverscape.js').read()
scene = re.sub(r"import \{[^}]*\} from '\./(riverscape/[a-z]+|textures|bubbles|snails)\.js';\n", '', scene)
scene = scene.replace('export function setFishDetail', 'function setFishDetail')
scene = scene.replace("import * as THREE from 'three';", '')
scene = scene.replace('export async function createRiverscape', 'async function createRiverscape')
scene = scene.replace('export function steerShoal', 'function steerShoal')

shell = open(sys.argv[1]).read()
a = shell.index("      import * as THREE from 'three';")
b = shell.index("      const canvas = document.getElementById('scene');")
body = ("      import * as THREE from 'three';\n" + textures + '\n'
        + '\n'.join(bundle) + '\n' + scene + '\n')
open(sys.argv[2], 'w').write(shell[:a] + body + shell[b:])
print('bundled', len(shell[:a] + body + shell[b:]) // 1024, 'kB')
