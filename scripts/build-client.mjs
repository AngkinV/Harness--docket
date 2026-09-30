import { build } from 'esbuild'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export async function buildClient(destination = join(root, 'lib')) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  const define = { 'process.env.NODE_ENV': '"production"', __HARNESS_DOCKET_VERSION__: JSON.stringify(version) }
  const bundle = await build({ absWorkingDir: root, preserveSymlinks: true, entryPoints: [join(root, 'src/client/index.ts')], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022', external: ['react', '/harness-docket/*'], loader: { '.css': 'text' }, define })
  const output = `window.__ModuleLoader__.load({id: 'harness-docket', factory: (require) => {\nvar module = {exports:{}}; var exports = module.exports;\n${bundle.outputFiles[0].text}\nreturn module.exports;\n}});\n`
  new Script(output, { filename: 'client.js' })
  mkdirSync(destination, { recursive: true }); writeFileSync(join(destination, 'client.js'), output)
  for (const entry of ['avatar-renderer', 'motion-worker']) {
    await build({ absWorkingDir: root, preserveSymlinks: true, entryPoints: [join(root, 'src/client/' + entry + '.js')], outfile: join(destination, entry + '.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof', define })
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildClient()
