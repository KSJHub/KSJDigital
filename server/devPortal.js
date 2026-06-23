import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';

const processes = [
  {
    name: 'portal-api',
    command: npmCommand,
    args: ['run', 'portal:api'],
  },
  {
    name: 'vite',
    command: npmCommand,
    args: ['run', 'dev'],
  },
];

const children = [];
let shuttingDown = false;

function log(name, message) {
  const lines = String(message).split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    console.log(`[${name}] ${line}`);
  }
}

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const processConfig of processes) {
  const child = spawn(processConfig.command, processConfig.args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    env: process.env,
  });

  children.push(child);

  child.stdout.on('data', (data) => log(processConfig.name, data));
  child.stderr.on('data', (data) => log(processConfig.name, data));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`[${processConfig.name}] exited with ${signal ?? `code ${code}`}`);
    stopAll();
    process.exit(code ?? 1);
  });
}

process.on('SIGINT', () => {
  stopAll('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopAll('SIGTERM');
  process.exit(0);
});
