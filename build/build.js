const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'public', 'build');
const DASHBOARD_ENTRY = path.join(ROOT, 'public', 'js', 'dashboard', 'main.js');
const DASHBOARD_OUTFILE = path.join(BUILD_DIR, 'main.js');
const DASHBOARD_MAP = path.join(BUILD_DIR, 'main.js.map');
const MANIFEST_PATH = path.join(BUILD_DIR, 'manifest.json');
const isWatch = process.argv.includes('--watch');
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--minify');

function ensureBuildDir() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

function shortHash(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(data).digest('hex').slice(0, 8);
}

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

function updateManifest() {
  let manifest = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch (_) {
      manifest = {};
    }
  }

  if (fs.existsSync(DASHBOARD_OUTFILE)) {
    manifest['main.js'] = {
      hash: shortHash(DASHBOARD_OUTFILE),
      size: fileSize(DASHBOARD_OUTFILE),
    };
  }
  if (fs.existsSync(DASHBOARD_MAP)) {
    manifest['main.js.map'] = {
      hash: shortHash(DASHBOARD_MAP),
      size: fileSize(DASHBOARD_MAP),
    };
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

async function buildOnce() {
  ensureBuildDir();
  await esbuild.build({
    entryPoints: [DASHBOARD_ENTRY],
    outfile: DASHBOARD_OUTFILE,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    sourcemap: true,
    minify: isProd,
    logLevel: 'info',
  });
  updateManifest();
}

async function watch() {
  ensureBuildDir();
  const ctx = await esbuild.context({
    entryPoints: [DASHBOARD_ENTRY],
    outfile: DASHBOARD_OUTFILE,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    sourcemap: true,
    minify: isProd,
    logLevel: 'info',
    plugins: [{
      name: 'manifest-updater',
      setup(build) {
        build.onEnd((result) => {
          if (!result.errors.length) {
            updateManifest();
          }
        });
      },
    }],
  });
  await ctx.watch();
  console.log('[build] watching dashboard bundle...');
}

(async () => {
  if (isWatch) {
    await watch();
    return;
  }
  await buildOnce();
})();
