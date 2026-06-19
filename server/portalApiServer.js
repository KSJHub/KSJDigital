import http from 'node:http';
import { runDeployment } from './deploymentRunner.js';
import {
  enqueueDeploymentJob,
  getDeploymentStatus,
  getNextQueuedDeploymentJob,
  getQueuedDeploymentJobs,
  updateQueuedDeploymentJob,
} from './deploymentStateStore.js';
import { getContentFileState, publishContentFile } from './githubContentPublisher.js';

const PORT = Number(process.env.PORT || process.env.PORTAL_API_PORT || 4174);
const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.PORTAL_ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });

    request.on('error', reject);
  });
}

async function handlePublishContent(request, response) {
  try {
    const body = await readJsonBody(request);
    const preparedWrite = body.preparedWrite ?? body;
    const result = await publishContentFile(preparedWrite);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, error.code === 'CONTENT_FILE_CONFLICT' ? 409 : 400, {
      ok: false,
      code: error.code,
      message: error.message || 'Unable to publish content file.',
      details: error.details,
    });
  }
}

async function handleQueueDeployment(request, response) {
  try {
    const body = await readJsonBody(request);
    const job = await enqueueDeploymentJob({
      deployment: body.deployment,
      website: body.website,
      source: body.source ?? 'portal-admin',
      status: body.status ?? 'Queued',
      message: body.message ?? 'Deployment persisted to server queue.',
    });
    sendJson(response, 200, { ok: true, job, message: 'Deployment job persisted to server queue.' });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      code: error.code,
      message: error.message || 'Unable to queue deployment.',
      details: error.details,
    });
  }
}

async function handleDeploymentQueue(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const status = url.searchParams.get('status');
    const queue = await getQueuedDeploymentJobs(status);
    sendJson(response, 200, { ok: true, queue });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message: error.message || 'Unable to read deployment queue.',
      details: error.details,
    });
  }
}

async function runDeploymentAndPersist({ deployment, website, source = 'manual-run' }) {
  const deploymentId = deployment?.id ?? deployment?.deploymentId;
  const queuedJob = await enqueueDeploymentJob({
    deployment,
    website,
    source,
    status: 'Running',
    message: 'Deployment worker started from portal API.',
  });

  try {
    const result = await runDeployment({ deployment: queuedJob.deployment, website: queuedJob.website });
    await updateQueuedDeploymentJob(deploymentId, {
      status: result.ok ? 'Success' : result.dryRun ? 'Queued' : 'Failed',
      message: result.message,
      result,
    });
    return result;
  } catch (error) {
    await updateQueuedDeploymentJob(deploymentId, {
      status: 'Failed',
      message: error.message || 'Deployment failed before worker result was returned.',
      error: { code: error.code, message: error.message, details: error.details },
    });
    throw error;
  }
}

async function handleRunDeployment(request, response) {
  try {
    const body = await readJsonBody(request);
    const result = await runDeploymentAndPersist({ deployment: body.deployment, website: body.website });
    sendJson(response, result.ok || result.dryRun ? 200 : 400, result);
  } catch (error) {
    sendJson(response, error.code === 'DEPLOYMENT_LOCKED' ? 409 : 400, {
      ok: false,
      code: error.code,
      message: error.message || 'Unable to run deployment.',
      details: error.details,
    });
  }
}

async function handleProcessNextDeployment(request, response) {
  try {
    const nextJob = await getNextQueuedDeploymentJob();
    if (!nextJob) return sendJson(response, 200, { ok: true, idle: true, message: 'No queued deployment jobs to process.' });
    if (!nextJob.website) return sendJson(response, 400, { ok: false, message: `Queued deployment ${nextJob.deploymentId} is missing website metadata.` });

    const result = await runDeploymentAndPersist({ deployment: nextJob.deployment, website: nextJob.website, source: 'process-next' });
    sendJson(response, result.ok || result.dryRun ? 200 : 400, { ok: result.ok, job: nextJob, result });
  } catch (error) {
    sendJson(response, error.code === 'DEPLOYMENT_LOCKED' ? 409 : 400, {
      ok: false,
      code: error.code,
      message: error.message || 'Unable to process queued deployment.',
      details: error.details,
    });
  }
}

async function handleDeploymentStatus(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const deploymentId = url.searchParams.get('deploymentId');
    const result = await getDeploymentStatus(deploymentId);
    sendJson(response, 200, { ok: true, deploymentId, ...result });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message: error.message || 'Unable to read deployment status.',
      details: error.details,
    });
  }
}

async function handleContentState(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const path = url.searchParams.get('path');
    const result = await getContentFileState(path);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message: error.message || 'Unable to read content file state.',
      details: error.details,
    });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'OPTIONS') return sendJson(response, 204, {});

  if (request.method === 'GET' && url.pathname === '/api/portal/health') {
    return sendJson(response, 200, { ok: true, service: 'KSJ Digital Portal API' });
  }

  if (request.method === 'GET' && url.pathname === '/api/portal/content/state') {
    return handleContentState(request, response);
  }

  if (request.method === 'GET' && url.pathname === '/api/portal/deployments/status') {
    return handleDeploymentStatus(request, response);
  }

  if (request.method === 'GET' && url.pathname === '/api/portal/deployments/queue') {
    return handleDeploymentQueue(request, response);
  }

  if (request.method === 'POST' && url.pathname === '/api/portal/content/publish') {
    return handlePublishContent(request, response);
  }

  if (request.method === 'POST' && url.pathname === '/api/portal/deployments/enqueue') {
    return handleQueueDeployment(request, response);
  }

  if (request.method === 'POST' && url.pathname === '/api/portal/deployments/process-next') {
    return handleProcessNextDeployment(request, response);
  }

  if (request.method === 'POST' && url.pathname === '/api/portal/deployments/run') {
    return handleRunDeployment(request, response);
  }

  return sendJson(response, 404, { ok: false, message: 'Route not found.' });
});

server.listen(PORT, () => {
  console.log(`KSJ Digital Portal API listening on port ${PORT}`);
});
