'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..', '..');
const entryFile = path.join(__dirname, 'bestfps-hwid.js');
const outputFile = path.join(__dirname, 'dist', 'windows', 'bestfps-hwid.exe');
const target = process.env.HWID_PKG_TARGET || 'node16-win-x64';

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    '--yes',
    'pkg',
    entryFile,
    '--targets',
    target,
    '--output',
    outputFile,
  ],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  }
);

if (result.error) {
  throw result.error;
}

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}

process.stdout.write(`Built: ${outputFile}\n`);
