import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE_DIR = path.join(process.cwd(), 'server', 'runtime');
const STATE_DIR = process.env.PORTAL_DEPLOY_STATE_DIR || DEFAULT_STATE_DIR;
const STATE_FILE = path.join(STATE_DIR, 'deployment-state.json');

const defaultState = {
  meta: {
    version: 2,
    updatedAt: null,
  },
  activeLocks: {},
  deploymentQueue: [],
  deployments: [],
  logs: {},
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function ensureStateDir() {
  await mkdir(STATE_DIR, { recursive: true });
}

function getDeploymentIdentity(deployment) {
  return deployment?.deploymentId ?? deployment?.id ?? null;
}

function normaliseQueuedJob(job) {
  const deployment = job?.deployment ?? job;
  const deploymentId = getDeploymentIdentity(deployment) ?? getDeploymentIdentity(job);

  return {
    id: job?.id ?? deploymentId,
    deploymentId,
    websiteId: job?.websiteId ?? deployment?.websiteId ?? job?.website?.id ?? null,
    status: job?.status ?? deployment?.status ?? 'Queued',
    createdAt: job?.createdAt ?? deployment?.createdAt ?? new Date().toISOString(),
    updatedAt: job?.updatedAt ?? new Date().toISOString(),
    deployment,
    website: job?.website ?? null,
    source: job?.source ?? 'portal-api',
    message: job?.message ?? '',
  };
}

function normaliseState(state) {
  return {
    ...clone(defaultState),
    ...(state ?? {}),
    meta: { ...defaultState.meta, ...(state?.meta ?? {}) },
    activeLocks: { ...(state?.activeLocks ?? {}) },
    deploymentQueue: Array.isArray(state?.deploymentQueue) ? state.deploymentQueue.map(normaliseQueuedJob) : [],
    deployments: Array.isArray(state?.deployments) ? state.deployments : [],
    logs: state?.logs ?? {},
  };
}

export async function readDeploymentState() {
  await ensureStateDir();
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return normaliseState(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Unable to read deployment state. Recreating state file.', error);
    const state = clone(defaultState);
    await writeDeploymentState(state);
    return state;
  }
}

export async function writeDeploymentState(state) {
  await ensureStateDir();
  const nextState = normaliseState(state);
  nextState.meta.updatedAt = new Date().toISOString();
  await writeFile(STATE_FILE, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return nextState;
}

export async function enqueueDeploymentJob({ deployment, website, source = 'portal-api', status = 'Queued', message = '' }) {
  if (!deployment?.id && !deployment?.deploymentId) throw new Error('Deployment job requires an id or deploymentId.');
  if (!website?.id && !deployment?.websiteId) throw new Error('Deployment job requires website metadata.');

  const state = await readDeploymentState();
  const deploymentId = getDeploymentIdentity(deployment);
  const queuedJob = normaliseQueuedJob({
    id: deploymentId,
    deploymentId,
    websiteId: deployment.websiteId ?? website?.id,
    status,
    deployment: { ...deployment, id: deployment.id ?? deploymentId, deploymentId },
    website,
    source,
    message,
    createdAt: deployment.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const existingQueue = state.deploymentQueue ?? [];
  state.deploymentQueue = existingQueue.some((job) => job.deploymentId === deploymentId || job.id === deploymentId)
    ? existingQueue.map((job) => (job.deploymentId === deploymentId || job.id === deploymentId ? { ...job, ...queuedJob, createdAt: job.createdAt ?? queuedJob.createdAt } : job))
    : [queuedJob, ...existingQueue].slice(0, 100);

  await writeDeploymentState(state);
  await recordDeploymentLog(deploymentId, { level: 'info', message: message || `Deployment job ${status.toLowerCase()} in server queue.`, source });
  return queuedJob;
}

export async function updateQueuedDeploymentJob(deploymentId, fields = {}) {
  if (!deploymentId) return null;
  const state = await readDeploymentState();
  let updatedJob = null;

  state.deploymentQueue = (state.deploymentQueue ?? []).map((job) => {
    if (job.deploymentId !== deploymentId && job.id !== deploymentId) return job;
    updatedJob = { ...job, ...fields, updatedAt: new Date().toISOString() };
    return updatedJob;
  });

  await writeDeploymentState(state);
  return updatedJob;
}

export async function getQueuedDeploymentJobs(status = null) {
  const state = await readDeploymentState();
  const queue = state.deploymentQueue ?? [];
  return status ? queue.filter((job) => job.status === status) : queue;
}

export async function getNextQueuedDeploymentJob() {
  const queue = await getQueuedDeploymentJobs('Queued');
  return queue[0] ?? null;
}

export async function recordDeploymentLog(deploymentId, entry) {
  if (!deploymentId) return null;
  const state = await readDeploymentState();
  const nextEntry = {
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const currentLogs = state.logs[deploymentId] ?? [];
  state.logs[deploymentId] = [...currentLogs, nextEntry].slice(-200);
  await writeDeploymentState(state);
  return nextEntry;
}

export async function recordDeploymentSnapshot(deployment) {
  if (!deployment?.deploymentId && !deployment?.id) return null;
  const deploymentId = deployment.deploymentId ?? deployment.id;
  const state = await readDeploymentState();
  const snapshot = {
    ...deployment,
    deploymentId,
    id: deployment.id ?? deploymentId,
    updatedAt: new Date().toISOString(),
  };
  const existing = state.deployments ?? [];
  state.deployments = existing.some((item) => (item.deploymentId ?? item.id) === deploymentId)
    ? existing.map((item) => ((item.deploymentId ?? item.id) === deploymentId ? { ...item, ...snapshot } : item))
    : [snapshot, ...existing].slice(0, 100);
  await writeDeploymentState(state);
  return snapshot;
}

export async function acquireDeploymentLock(deploymentId, metadata = {}) {
  if (!deploymentId) throw new Error('deploymentId is required for worker lock.');
  const state = await readDeploymentState();
  const existingLock = state.activeLocks[deploymentId];
  if (existingLock) {
    const error = new Error(`Deployment ${deploymentId} is already running.`);
    error.code = 'DEPLOYMENT_LOCKED';
    error.details = existingLock;
    throw error;
  }

  const lock = {
    deploymentId,
    acquiredAt: new Date().toISOString(),
    ...metadata,
  };
  state.activeLocks[deploymentId] = lock;
  await writeDeploymentState(state);
  return lock;
}

export async function releaseDeploymentLock(deploymentId) {
  if (!deploymentId) return;
  const state = await readDeploymentState();
  delete state.activeLocks[deploymentId];
  await writeDeploymentState(state);
}

export async function getDeploymentStatus(deploymentId) {
  const state = await readDeploymentState();
  if (!deploymentId) return state;
  const deployment = (state.deployments ?? []).find((item) => (item.deploymentId ?? item.id) === deploymentId) ?? null;
  const queuedJob = (state.deploymentQueue ?? []).find((item) => (item.deploymentId ?? item.id) === deploymentId) ?? null;
  return {
    deployment,
    queuedJob,
    logs: state.logs?.[deploymentId] ?? [],
    lock: state.activeLocks?.[deploymentId] ?? null,
  };
}
