#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const AGENT_VERSION = '1.1.0';
const TOKEN_FILE_NAME = 'bestfps-hwid-token.json';

function log(message) {
  process.stdout.write(`[bestfps-hwid] ${message}\n`);
}

function pauseExit(code) {
  process.stdout.write('\nPress Enter to exit...');
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', () => process.exit(code));
}

function candidateTokenPaths() {
  const candidates = [];
  if (process.pkg) {
    candidates.push(path.join(path.dirname(process.execPath), TOKEN_FILE_NAME));
  }
  if (__dirname) {
    candidates.push(path.join(__dirname, TOKEN_FILE_NAME));
  }
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  candidates.push(path.join(downloadsDir, TOKEN_FILE_NAME));
  return Array.from(new Set(candidates));
}

function readTokenFile() {
  for (const filePath of candidateTokenPaths()) {
    if (!filePath) continue;
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token || !parsed.bind_url) {
      throw new Error(`Token file is invalid: ${filePath}`);
    }
    return { filePath, parsed };
  }
  throw new Error(`Token file '${TOKEN_FILE_NAME}' was not found next to the executable or in Downloads.`);
}

function execCommand(command, args) {
  try {
    return execFileSync(command, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      encoding: 'utf8',
    }).trim();
  } catch (_) {
    return '';
  }
}

function powershellValue(expression) {
  return execCommand('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    expression,
  ]);
}

function registryValue(regPath, name) {
  const output = execCommand('reg.exe', ['query', regPath, '/v', name]);
  if (!output) return '';
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes(name)) continue;
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 3) {
      return parts.slice(2).join(' ').trim();
    }
  }
  return '';
}

function firstLine(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function getHardwareProfile() {
  const machineGuid = registryValue('HKLM\\SOFTWARE\\Microsoft\\Cryptography', 'MachineGuid');
  const biosSerial = firstLine(powershellValue("(Get-CimInstance Win32_BIOS | Select-Object -First 1 -ExpandProperty SerialNumber)"));
  const boardSerial = firstLine(powershellValue("(Get-CimInstance Win32_BaseBoard | Select-Object -First 1 -ExpandProperty SerialNumber)"));
  const cpuId = firstLine(powershellValue("(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty ProcessorId)"));
  const deviceName = os.hostname();
  const osName = `${os.type()} ${os.release()}`;

  const parts = [machineGuid, biosSerial, boardSerial, cpuId, deviceName]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!parts.length) {
    throw new Error('No usable hardware identifiers were collected.');
  }

  const hwidHash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');

  return {
    hwid_hash: hwidHash,
    device_name: deviceName,
    os_name: osName,
    agent_version: AGENT_VERSION,
  };
}

async function bind(config) {
  const payload = {
    token: String(config.token),
    hwid_hash: config.hwid_hash,
    device_name: config.device_name,
    os_name: config.os_name,
    agent_version: config.agent_version,
  };

  const response = await fetch(String(config.bind_url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `bestfps-hwid/${AGENT_VERSION}`,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error(`Server returned a non-JSON response (${response.status}).`);
    }
  }

  if (!response.ok) {
    throw new Error(data.error || `Binding failed with status ${response.status}.`);
  }

  return data;
}

async function main() {
  try {
    const { filePath, parsed } = readTokenFile();
    log(`Using token file: ${filePath}`);

    const hardware = getHardwareProfile();
    log(`Binding HWID for account #${parsed.account_id || 'unknown'}...`);

    const result = await bind({
      token: parsed.token,
      bind_url: parsed.bind_url,
      hwid_hash: hardware.hwid_hash,
      device_name: hardware.device_name,
      os_name: hardware.os_name,
      agent_version: hardware.agent_version,
    });

    log(result.message || 'HWID binding completed successfully.');

    try {
      fs.unlinkSync(filePath);
      log('One-time token file removed.');
    } catch (_) {
      log('Token file could not be removed automatically.');
    }

    process.stdout.write('\nHWID binding completed successfully.\n');
    pauseExit(0);
  } catch (err) {
    process.stderr.write(`\n[bestfps-hwid] ${err.message}\n`);
    process.stdout.write('\nHWID binding failed.\n');
    pauseExit(1);
  }
}

main();
