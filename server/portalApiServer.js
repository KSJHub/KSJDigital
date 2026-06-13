import http from 'node:http';
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

  if (request.method === 'POST' && url.pathname === '/api/portal/content/publish') {
    return handlePublishContent(request, response);
  }

  return sendJson(response, 404, { ok: false, message: 'Route not found.' });
});

server.listen(PORT, () => {
  console.log(`KSJ Digital Portal API listening on port ${PORT}`);
});
