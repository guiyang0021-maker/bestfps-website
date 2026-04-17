'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const cppRoot = path.join(repoRoot, 'tools', 'hwid-agent-cpp');
const exePath = path.join(cppRoot, 'dist', 'windows', 'bestfps-hwid.exe');

const requiredFiles = [
  'README.md',
  'CMakeLists.txt',
  path.join('src', 'main.cpp'),
];

const requiredSourceHints = [
  { label: 'token filename', pattern: /bestfps-hwid-token\.json/i },
  { label: 'bind payload field: hwid_hash', pattern: /\bhwid_hash\b/ },
  { label: 'bind payload field: device_name', pattern: /\bdevice_name\b/ },
  { label: 'bind payload field: agent_version', pattern: /\bagent_version\b/ },
];

const hazardPatterns = [
  { severity: 'fail', label: 'TLS certificate bypass', pattern: /SECURITY_FLAG_IGNORE_|IGNORE_CERT_|CURLOPT_SSL_VERIFYPEER\s*[,)=]\s*0|CURLOPT_SSL_VERIFYHOST\s*[,)=]\s*0/i },
  { severity: 'fail', label: 'shell execution', pattern: /\bsystem\s*\(|_wpopen\s*\(|_popen\s*\(|cmd\.exe|powershell(?:\.exe)?/i },
  { severity: 'warn', label: 'possible token logging', pattern: /(cout|cerr|printf|fprintf|OutputDebugString)[^;\n]*token/i },
];

function walkFiles(dir, predicate, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, result);
      continue;
    }
    if (predicate(fullPath)) result.push(fullPath);
  }
  return result;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function relative(filePath) {
  return path.relative(repoRoot, filePath) || '.';
}

function hasPeHeader(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(2);
    fs.readSync(fd, buffer, 0, 2, 0);
    return buffer.toString('ascii') === 'MZ';
  } finally {
    fs.closeSync(fd);
  }
}

function collectSources() {
  return walkFiles(
    cppRoot,
    (filePath) => /\.(c|cc|cpp|cxx|h|hpp)$/i.test(filePath)
  );
}

function report(level, message) {
  const prefix = level === 'PASS' ? '[PASS]' : level === 'WARN' ? '[WARN]' : '[FAIL]';
  process.stdout.write(`${prefix} ${message}\n`);
}

function main() {
  const failures = [];
  const warnings = [];

  if (!fs.existsSync(cppRoot)) {
    failures.push(`missing delivery root: ${relative(cppRoot)}`);
  }

  for (const relPath of requiredFiles) {
    const fullPath = path.join(cppRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      failures.push(`missing required file: ${relative(fullPath)}`);
    }
  }

  const slnFiles = walkFiles(cppRoot, (filePath) => /\.sln$/i.test(filePath));
  const vcxprojFiles = walkFiles(cppRoot, (filePath) => /\.vcxproj$/i.test(filePath));
  if (!fs.existsSync(path.join(cppRoot, 'CMakeLists.txt')) && !slnFiles.length && !vcxprojFiles.length) {
    failures.push('missing Windows-native build entry (CMakeLists.txt or .sln/.vcxproj)');
  }

  if (!fs.existsSync(exePath)) {
    failures.push(`missing built executable: ${relative(exePath)}`);
  } else if (!hasPeHeader(exePath)) {
    failures.push(`invalid Windows executable header: ${relative(exePath)}`);
  }

  const sourceFiles = collectSources();
  if (!sourceFiles.length) {
    failures.push(`no C/C++ source files found under ${relative(cppRoot)}`);
  }

  if (sourceFiles.length) {
    const sourceText = sourceFiles.map((filePath) => readText(filePath)).join('\n');

    for (const hint of requiredSourceHints) {
      if (!hint.pattern.test(sourceText)) {
        warnings.push(`missing source hint for ${hint.label}`);
      }
    }

    for (const hazard of hazardPatterns) {
      if (hazard.pattern.test(sourceText)) {
        const line = `${hazard.label} detected by static scan`;
        if (hazard.severity === 'fail') {
          failures.push(line);
        } else {
          warnings.push(line);
        }
      }
    }
  }

  if (!failures.length) {
    report('PASS', `delivery root present: ${relative(cppRoot)}`);
  }
  for (const warning of warnings) {
    report('WARN', warning);
  }
  for (const failure of failures) {
    report('FAIL', failure);
  }

  process.stdout.write('\n');
  process.stdout.write(`Checked sources: ${sourceFiles.length}\n`);
  process.stdout.write(`Warnings: ${warnings.length}\n`);
  process.stdout.write(`Failures: ${failures.length}\n`);

  if (failures.length) {
    process.exitCode = 1;
  }
}

main();
