import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  acquireDeploymentLock,
  recordDeploymentLog,
  recordDeploymentSnapshot,
  releaseDeploymentLock,
} from './deploymentStateStore.js';

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

async function runStep(step, cwd, deploymentId) {
  const startedAt = new Date().toISOString();
  await recordDeploymentLog(deploymentId, { level: 'info', message: `Starting step: ${step.name}`, step: step.name });

  try {
    const { stdout, stderr } = await execFileAsync(step.command, step.args, {
      cwd,
      timeout: Number(process.env.PORTAL_DEPLOY_STEP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      maxBuffer: 1024 * 1024 * 2,
      env: { ...process.env, CI: 'true' },
    });

    const result = {
      ...step,
      status: 'Success',
      startedAt,
      completedAt: new Date().toISOString(),
      stdout: stdout?.slice(-4000) || '',
      stderr: stderr?.slice(-4000) || '',
    };

    await recordDeploymentLog(deploymentId, { level: 'success', message: `Completed step: ${step.name}`, step: step.name, stdout: result.stdout, stderr: result.stderr });
    return result;
  } catch (error) {
    const result = {
      ...step,
      status: 'Failed',
      startedAt,
      completedAt: new Date().toISOString(),
      stdout: error.stdout?.slice?.(-4000) || '',
      stderr: error.stderr?.slice?.(-4000) || error.message,
    };

    await recordDeploymentLog(deploymentId, { level: 'error', message: `Failed step: ${step.name}`, step: step.name, stdout: result.stdout, stderr: result.stderr });
    return result;
  }
}

async function verifyDeployment(website, deploymentId) {
  const verificationUrl = website.deployment?.verificationUrl || website.url;
  if (!verificationUrl || process.env.PORTAL_DEPLOY_VERIFY_URLS === 'false') {
    return { status: 'Skipped', message: 'Verification URL check skipped.' };
  }

  await recordDeploymentLog(deploymentId, { level: 'info', message: `Verifying deployment URL: ${verificationUrl}` });

  try {
    const response = await fetch(verificationUrl, { method: 'GET' });
    const ok = response.status >= 200 && response.status < 400;
    const result = {
      status: ok ? 'Success' : 'Failed',
      url: verificationUrl,
      statusCode: response.status,
      message: ok ? 'Verification URL responded successfully.' : `Verification URL returned HTTP ${response.status}.`,
    };
    await recordDeploymentLog(deploymentId, { level: ok ? 'success' : 'error', message: result.message, verification: result });
    return result;
  } catch (error) {
    const result = { status: 'Failed', url: verificationUrl, message: error.message || 'Verification request failed.' };
    await recordDeploymentLog(deploymentId, { level: 'error', message: result.message, verification: result });
    return result;
  }
}

export async function previewDeployment({ deployment, website }) {
  assertSafeWebsite(website);
  const deploymentId = deployment?.id ?? deployment?.deploymentId ?? `deployment-${website.id}-${Date.now()}`;
  const steps = getDeploymentSteps(website);
  const result = {
    ok: true,
    dryRun: true,
    deploymentId,
    websiteId: website.id,
    status: 'Preview',
    vpsPath: website.deployment.vpsPath,
    steps: steps.map((step) => ({ ...step, status: 'Planned' })),
    message: 'Deployment preview created. Real command execution is disabled until PORTAL_DEPLOYMENTS_ENABLED=true.',
  };

  await recordDeploymentLog(deploymentId, { level: 'info', message: result.message, dryRun: true });
  await recordDeploymentSnapshot(result);
  return result;
}

export async function runDeployment({ deployment, website }) {
  assertSafeWebsite(website);
  const deploymentId = deployment?.id ?? deployment?.deploymentId ?? `deployment-${website.id}-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const steps = getDeploymentSteps(website);

  if (!deploymentsAreEnabled()) {
    return previewDeployment({ deployment: { ...deployment, id: deploymentId }, website });
  }

  await acquireDeploymentLock(deploymentId, { websiteId: website.id, actor: deployment?.actor ?? 'Portal Worker' });
  await recordDeploymentLog(deploymentId, { level: 'info', message: 'Deployment lock acquired. Worker started.' });

  try {
    const results = [];
    await recordDeploymentSnapshot({ deploymentId, websiteId: website.id, status: 'Running', startedAt, steps: results });

    for (const step of steps) {
      const result = await runStep(step, website.deployment.vpsPath, deploymentId);
      results.push(result);
      await recordDeploymentSnapshot({ deploymentId, websiteId: website.id, status: 'Running', startedAt, steps: results });

      if (result.status === 'Failed') {
        const failedResult = {
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
        await recordDeploymentSnapshot(failedResult);
        return failedResult;
      }
    }

    const verification = await verifyDeployment(website, deploymentId);
    const success = verification.status !== 'Failed';
    const finalResult = {
      ok: success,
      dryRun: false,
      deploymentId,
      websiteId: website.id,
      status: success ? 'Success' : 'Failed',
      startedAt,
      completedAt: new Date().toISOString(),
      steps: results,
      verification,
      message: success ? 'Deployment completed successfully.' : 'Deployment completed but verification failed.',
    };

    await recordDeploymentSnapshot(finalResult);
    await recordDeploymentLog(deploymentId, { level: success ? 'success' : 'error', message: finalResult.message });
    return finalResult;
  } finally {
    await releaseDeploymentLock(deploymentId);
    await recordDeploymentLog(deploymentId, { level: 'info', message: 'Deployment lock released.' });
  }
}
