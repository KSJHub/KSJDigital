import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 1000 * 60 * 5;
const ALLOWED_PROVIDER_LABELS = ['VPS / Nginx', 'VPS', 'Local VPS'];

function deploymentsAreEnabled() {
  return process.env.PORTAL_DEPLOYMENTS_ENABLED === 'true';
}

function getAllowedRootPaths() {
  return (process.env.PORTAL_DEPLOY_ALLOWED_ROOTS || '/home')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normaliseCommand(command) {
  return String(command || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function assertSafeVpsPath(vpsPath) {
  if (!vpsPath || typeof vpsPath !== 'string') throw new Error('Deployment vpsPath is required.');
  if (!vpsPath.startsWith('/')) throw new Error('Deployment vpsPath must be an absolute path.');
  if (vpsPath.includes('..')) throw new Error('Deployment vpsPath cannot contain path traversal.');

  const allowedRoots = getAllowedRootPaths();
  if (!allowedRoots.some((root) => vpsPath === root || vpsPath.startsWith(`${root}/`))) {
    throw new Error(`Deployment path ${vpsPath} is outside allowed roots: ${allowedRoots.join(', ')}`);
  }
}

function assertSafeWebsite(website) {
  if (!website?.id) throw new Error('Deployment website metadata is required.');
  const provider = website.deployment?.provider || website.provider || '';
  if (provider && !ALLOWED_PROVIDER_LABELS.includes(provider)) {
    throw new Error(`Deployment provider ${provider} is not enabled for the local runner.`);
  }
  assertSafeVpsPath(website.deployment?.vpsPath);
}

function createStep(name, command, args = []) {
  return { name, command, args };
}

function getDeploymentSteps(website) {
  const buildCommand = normaliseCommand(website.deployment?.buildCommand || 'npm run build');
  const steps = [createStep('Git Pull', 'git', ['pull'])];

  if (website.deployment?.installCommand !== 'skip') {
    steps.push(createStep('Install Dependencies', 'npm', ['install']));
  }

  if (buildCommand === 'npm run build') {
    steps.push(createStep('Build Website', 'npm', ['run', 'build']));
  } else if (buildCommand === 'npm run build -- --mode production') {
    steps.push(createStep('Build Website', 'npm', ['run', 'build', '--', '--mode', 'production']));
  } else {
    throw new Error(`Unsupported build command: ${buildCommand}`);
  }

  return steps;
}

async function runStep(step, cwd) {
  const startedAt = new Date().toISOString();
  try {
    const { stdout, stderr } = await execFileAsync(step.command, step.args, {
      cwd,
      timeout: Number(process.env.PORTAL_DEPLOY_STEP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      maxBuffer: 1024 * 1024 * 2,
      env: { ...process.env, CI: 'true' },
    });

    return {
      ...step,
      status: 'Success',
      startedAt,
      completedAt: new Date().toISOString(),
      stdout: stdout?.slice(-4000) || '',
      stderr: stderr?.slice(-4000) || '',
    };
  } catch (error) {
    return {
      ...step,
      status: 'Failed',
      startedAt,
      completedAt: new Date().toISOString(),
      stdout: error.stdout?.slice?.(-4000) || '',
      stderr: error.stderr?.slice?.(-4000) || error.message,
    };
  }
}

export function previewDeployment({ deployment, website }) {
  assertSafeWebsite(website);
  const steps = getDeploymentSteps(website);

  return {
    ok: true,
    dryRun: true,
    deploymentId: deployment?.id ?? deployment?.deploymentId ?? null,
    websiteId: website.id,
    vpsPath: website.deployment.vpsPath,
    steps: steps.map((step) => ({ ...step, status: 'Planned' })),
    message: 'Deployment preview created. Real command execution is disabled until PORTAL_DEPLOYMENTS_ENABLED=true.',
  };
}

export async function runDeployment({ deployment, website }) {
  assertSafeWebsite(website);
  const deploymentId = deployment?.id ?? deployment?.deploymentId ?? `deployment-${website.id}-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const steps = getDeploymentSteps(website);

  if (!deploymentsAreEnabled()) {
    return previewDeployment({ deployment: { ...deployment, id: deploymentId }, website });
  }

  const results = [];
  for (const step of steps) {
    const result = await runStep(step, website.deployment.vpsPath);
    results.push(result);
    if (result.status === 'Failed') {
      return {
        ok: false,
        dryRun: false,
        deploymentId,
        websiteId: website.id,
        status: 'Failed',
        startedAt,
        completedAt: new Date().toISOString(),
        steps: results,
        message: `${step.name} failed. Deployment stopped safely.`,
      };
    }
  }

  return {
    ok: true,
    dryRun: false,
    deploymentId,
    websiteId: website.id,
    status: 'Success',
    startedAt,
    completedAt: new Date().toISOString(),
    steps: results,
    message: 'Deployment completed successfully.',
  };
}
