import { spawn } from 'node:child_process';

const processes = [
  {
    name: 'portal-api',
    command: 'npm run portal:api',
  },
  {
    name: 'vite',
    command: 'npm run dev',
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
  const child = spawn(processConfig.command, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    windowsHide: false,
  });

  children.push(child);

  child.stdout.on('data', (data) => log(processConfig.name, data));
  child.stderr.on('data', (data) => log(processConfig.name, data));

  child.on('error', (error) => {
    console.error(`[${processConfig.name}] failed to start: ${error.message}`);
    stopAll();
    process.exit(1);
  });

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
