const DEFAULT_PORTAL_API_BASE_URL = 'http://localhost:4174';

function getPortalApiBaseUrl() {
  return import.meta.env?.VITE_PORTAL_API_BASE_URL || DEFAULT_PORTAL_API_BASE_URL;
}

async function readPortalApiResponse(response) {
  const payload = await response.json();
  return {
    ok: response.ok && payload.ok !== false,
    ...payload,
    httpStatus: response.status,
  };
}

export async function enqueuePortalDeployment({ deployment, website, status = 'Queued', message = 'Deployment queued from admin dashboard.' }) {
  try {
    const response = await fetch(`${getPortalApiBaseUrl()}/api/portal/deployments/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deployment, website, status, message, source: 'portal-admin-dashboard' }),
    });

    return readPortalApiResponse(response);
  } catch (error) {
    return {
      ok: false,
      offline: true,
      message: error.message || 'Portal deployment queue API is unavailable.',
    };
  }
}

export async function getPortalDeploymentQueue(status) {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const response = await fetch(`${getPortalApiBaseUrl()}/api/portal/deployments/queue${query}`);
    return readPortalApiResponse(response);
  } catch (error) {
    return {
      ok: false,
      offline: true,
      message: error.message || 'Portal deployment queue API is unavailable.',
    };
  }
}

export async function processNextPortalDeployment() {
  try {
    const response = await fetch(`${getPortalApiBaseUrl()}/api/portal/deployments/process-next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    return readPortalApiResponse(response);
  } catch (error) {
    return {
      ok: false,
      offline: true,
      message: error.message || 'Portal deployment process API is unavailable.',
    };
  }
}

export async function runPortalDeployment({ deployment, website }) {
  try {
    const response = await fetch(`${getPortalApiBaseUrl()}/api/portal/deployments/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deployment, website }),
    });

    return readPortalApiResponse(response);
  } catch (error) {
    return {
      ok: false,
      offline: true,
      message: error.message || 'Portal deployment API is unavailable.',
    };
  }
}

export async function getPortalDeploymentStatus(deploymentId) {
  try {
    const query = deploymentId ? `?deploymentId=${encodeURIComponent(deploymentId)}` : '';
    const response = await fetch(`${getPortalApiBaseUrl()}/api/portal/deployments/status${query}`);
    return readPortalApiResponse(response);
  } catch (error) {
    return {
      ok: false,
      offline: true,
      message: error.message || 'Portal deployment status API is unavailable.',
    };
  }
}
