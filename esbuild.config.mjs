import { context } from 'esbuild';
import { mkdir, writeFile, readFile, watch } from 'node:fs/promises';
import { resolve } from 'node:path';

try { process.loadEnvFile?.(); } catch {}

const watching = process.argv.includes('--watch');
const destination = 'dist/tree-work';
const vaultPath = process.env.VAULT_PATH;
const vaultPluginDir = vaultPath ? resolve(vaultPath, '.obsidian/plugins/tree-work') : null;

await mkdir(destination, { recursive: true });
if (vaultPluginDir) {
  await mkdir(vaultPluginDir, { recursive: true });
  // Hot Reload community plugin requires .hotreload file to track this plugin
  await writeFile(`${vaultPluginDir}/.hotreload`, '');
}

async function copyMetadata() {
  const manifest = await readFile('manifest.json');
  await writeFile(`${destination}/manifest.json`, manifest);
  if (vaultPluginDir) {
    await writeFile(`${vaultPluginDir}/manifest.json`, manifest);
  }
}

const build = await context({
  entryPoints: ['src/obsidian/main.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  external: ['obsidian'],
  outfile: `${destination}/main.js`,
  write: false,
  minify: !watching,
  sourcemap: watching ? 'inline' : false,
  define: { 'process.env.NODE_ENV': JSON.stringify(watching ? 'development' : 'production') },
  metafile: true,
  plugins: [{
    name: 'obsidian-package',
    setup(builder) {
      builder.onEnd(async result => {
        if (result.errors.length) return;
        for (const file of result.outputFiles) {
          const name = file.path.endsWith('.css') ? 'styles.css' : 'main.js';
          await writeFile(`${destination}/${name}`, file.contents);
          if (vaultPluginDir) {
            await writeFile(`${vaultPluginDir}/${name}`, file.contents);
          }
        }
        await copyMetadata();
        await writeFile('dist/plugin-meta.json', JSON.stringify(result.metafile, null, 2));
        console.log(`Tree Work plugin built in ${destination}/`);
        if (vaultPluginDir) {
          console.log(`Synced plugin to ${vaultPluginDir}/`);
        }
      });
    },
  }],
});

if (watching) {
  await build.watch();
  console.log(`Watching plugin source.${vaultPluginDir ? ` Auto-syncing to ${vaultPluginDir}` : ' Copy output to your vault to test.'}`);
  for await (const _ of watch('manifest.json')) await copyMetadata();
} else {
  try { await build.rebuild(); } finally { await build.dispose(); }
}
