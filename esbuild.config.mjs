import { context } from 'esbuild';
import { mkdir, writeFile, readFile, watch } from 'node:fs/promises';
import { resolve } from 'node:path';

try { process.loadEnvFile?.(); } catch {}

const watching = process.argv.includes('--watch');
const destination = 'dist/tree-work';
const vaultPath = process.env.VAULT_PATH;
const vaultPluginDir = vaultPath ? resolve(vaultPath, '.obsidian/plugins/tree-work') : null;

await mkdir(destination, { recursive: true });
let canSyncToVault = false;
if (vaultPluginDir) {
  try {
    await mkdir(vaultPluginDir, { recursive: true });
    await writeFile(`${vaultPluginDir}/.hotreload`, '');
    canSyncToVault = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Vault path not accessible (${vaultPluginDir}), skipping sync: ${message}`);
  }
}

async function copyMetadata() {
  const manifest = await readFile('manifest.json');
  await writeFile(`${destination}/manifest.json`, manifest);
  if (canSyncToVault) {
    try {
      await writeFile(`${vaultPluginDir}/manifest.json`, manifest);
    } catch {}
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
  plugins: [
    {
      name: 'sanitize-react-dom',
      setup(builder) {
        builder.onLoad({ filter: /react-dom/ }, async (args) => {
          let contents = await readFile(args.path, 'utf8');
          // Obsidian rejects dynamic script element creation. Strip React 19's DOM hoistable script injection.
          contents = contents
            .replaceAll('.createElement("script")', '.createElement("span")')
            .replaceAll(".createElement('script')", '.createElement("span")')
            .replaceAll('<script>\\x3c/script>', '<span></span>')
            .replaceAll('case "script":', 'case "__script_disabled__":');
          return { contents, loader: 'js' };
        });
      },
    },
    {
      name: 'obsidian-package',
    setup(builder) {
      builder.onEnd(async result => {
        if (result.errors.length) return;
        for (const file of result.outputFiles) {
          const name = file.path.endsWith('.css') ? 'styles.css' : 'main.js';
          await writeFile(`${destination}/${name}`, file.contents);
          if (canSyncToVault) {
            try {
              await writeFile(`${vaultPluginDir}/${name}`, file.contents);
            } catch {}
          }
        }
        await copyMetadata();
        await writeFile('dist/plugin-meta.json', JSON.stringify(result.metafile, null, 2));
        console.log(`Tree Work plugin built in ${destination}/`);
        if (canSyncToVault) {
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
