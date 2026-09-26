import { readFile, writeFile } from 'node:fs/promises';

const targetVersion = process.argv[2] || process.env.npm_package_version;
if (!targetVersion) {
  console.error('Usage: node scripts/version-bump.mjs <target-version>');
  process.exit(1);
}

// 1. Update manifest.json
const manifestPath = new URL('../manifest.json', import.meta.url);
const manifestRaw = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
manifest.version = targetVersion;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// 2. Update versions.json with minAppVersion mapping
const versionsPath = new URL('../versions.json', import.meta.url);
let versions = {};
try {
  const versionsRaw = await readFile(versionsPath, 'utf8');
  versions = JSON.parse(versionsRaw);
} catch {}
versions[targetVersion] = manifest.minAppVersion;
await writeFile(versionsPath, JSON.stringify(versions, null, 2) + '\n');

// 3. Update package.json
const pkgPath = new URL('../package.json', import.meta.url);
const pkgRaw = await readFile(pkgPath, 'utf8');
const pkg = JSON.parse(pkgRaw);
pkg.version = targetVersion;
await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 4. Update package-lock.json if present
const lockPath = new URL('../package-lock.json', import.meta.url);
try {
  const lockRaw = await readFile(lockPath, 'utf8');
  const lock = JSON.parse(lockRaw);
  lock.version = targetVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = targetVersion;
  }
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
} catch {}

console.log(`Updated version to ${targetVersion} in manifest.json, versions.json, package.json, and package-lock.json`);
