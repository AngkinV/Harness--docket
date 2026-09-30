import { copyFileSync, readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, renameSync, rmSync, existsSync, lstatSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { embedClips } from './embed-clips.mjs'
import { buildClient } from './build-client.mjs'
import './check-css-template.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stage = mkdtempSync(join(root, '.lib-staging-')), dest = join(root, 'lib'), retired = stage + '-previous'
if (existsSync(dest) && lstatSync(dest).isSymbolicLink()) throw new Error('Refusing to replace a linked build directory')
try {
  embedClips(stage); await buildClient(stage)
  for (const source of readdirSync(join(root, 'src')).filter(name => name.endsWith('.js') && name !== 'resource-worker.js')) copyFileSync(join(root, 'src', source), join(stage, source === 'host.js' ? 'index.js' : source))
  await build({ entryPoints: [join(root, 'src/resource-worker.js')], outfile: join(stage, 'resource-worker.js'), bundle: true, format: 'esm', platform: 'node', target: 'node20', legalComments: 'eof' })
  mkdirSync(join(stage, 'types/client'), { recursive: true })
  copyFileSync(join(root, 'src/types/index.d.ts'), join(stage, 'types/index.d.ts'))
  copyFileSync(join(root, 'src/types/client.d.ts'), join(stage, 'types/client/index.d.ts'))
  const notices = ['three', '@pixiv/three-vrm', '@pixiv/three-vrm-core', '@pixiv/three-vrm-materials-mtoon', '@pixiv/three-vrm-materials-v0compat', '@pixiv/three-vrm-materials-hdr-emissive-multiplier', '@pixiv/three-vrm-node-constraint', '@pixiv/three-vrm-springbone'].map(name => name + '\n' + readFileSync(join(root, 'node_modules', name, 'LICENSE'), 'utf8'))
  writeFileSync(join(stage, 'third-party-licenses.txt'), notices.join('\n\n'))
  // A standalone public checkout keeps its reviewed motion manifest inside the package.
  const motions = existsSync(join(root, 'motions/motions.json')) ? join(root, 'motions') : resolve(root, '../../motions'), manifest = JSON.parse(readFileSync(join(motions, 'motions.json'), 'utf8'))
  mkdirSync(join(stage, 'motions'))
  for (const file of new Set(['motions.json', ...manifest.motions.map(item => item.file)])) {
    if (typeof file !== 'string' || file.includes('/') || file.includes('\\') || !/^(motions\.json|[\w .()-]+\.fbx)$/i.test(file)) throw new Error('Invalid motion manifest filename')
    copyFileSync(join(motions, file), join(stage, 'motions', file))
  }
  if (existsSync(dest)) renameSync(dest, retired)
  try { renameSync(stage, dest) } catch (e) { if (existsSync(retired)) renameSync(retired, dest); throw e }
  if (existsSync(retired)) rmSync(retired, { recursive: true })
  console.log('Built complete package from source and media manifests.')
} finally { if (existsSync(stage)) rmSync(stage, { recursive: true }) }
