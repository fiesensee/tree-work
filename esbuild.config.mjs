import { context } from 'esbuild';
import { mkdir, writeFile, copyFile, watch } from 'node:fs/promises';

const watching = process.argv.includes('--watch');
const destination = 'dist/tree-work';
await mkdir(destination, { recursive: true });

async function copyMetadata() {
  await copyFile('manifest.json', `${destination}/manifest.json`);
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
        }
        await copyMetadata();
        await writeFile('dist/plugin-meta.json', JSON.stringify(result.metafile, null, 2));
        console.log(`Tree Work plugin built in ${destination}/`);
      });
    },
  }],
});

if (watching) {
  await build.watch();
  console.log('Watching plugin source. Copy the output into your vault and reload the plugin to test.');
  for await (const _ of watch('manifest.json')) await copyMetadata();
} else {
  try { await build.rebuild(); } finally { await build.dispose(); }
}
