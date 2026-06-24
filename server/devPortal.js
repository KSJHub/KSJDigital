import net from 'node:net';
import { spawn } from 'node:child_process';

const DEV_SERVICES = [
  {
    name: 'portal-api',
    command: 'npm run portal:api:watch',
    port: 4174,
    url: 'http://localhost:4174/api/portal/health',
  },
  {
    name: 'vite',
    command: 'npm run dev',
    port: 5173,
    url: 'http://localhost:5173/',
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

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });

    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.once('error', () => {
      resolve(false);
    });

    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

async function startDevPortal() {
  console.log('[dev] Starting KSJ Digital development services...');

  for (const service of DEV_SERVICES) {
    const alreadyRunning = await isPortOpen(service.port);

    if (alreadyRunning) {
      console.log(`[${service.name}] already running on port ${service.port}`);
      console.log(`[${service.name}] ${service.url}`);
      continue;
    }

    const child = spawn(service.command, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
      windowsHide: false,
    });

    children.push(child);

    child.stdout.on('data', (data) => log(service.name, data));
    child.stderr.on('data', (data) => log(service.name, data));

    child.on('error', (error) => {
      console.error(`[${service.name}] failed to start: ${error.message}`);
      stopAll();
      process.exit(1);
    });

    child.on('exit', (code, signal) => {
      if (shuttingDown) return;
      console.log(`[${service.name}] exited with ${signal ?? `code ${code}`}`);
      stopAll();
      process.exit(code ?? 1);
    });
  }

  if (!children.length) {
    console.log('[dev] KSJ Digital development services are already running.');
  }
}

process.on('SIGINT', () => {
  stopAll('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopAll('SIGTERM');
  process.exit(0);
});

startDevPortal().catch((error) => {
  console.error(`[dev] failed to start KSJ Digital dev portal: ${error.message}`);
  process.exit(1);
});
