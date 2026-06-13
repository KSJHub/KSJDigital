const DEFAULT_PORTAL_API_BASE_URL = 'http://localhost:4174';

function getPortalApiBaseUrl() {
  return import.meta.env?.VITE_PORTAL_API_BASE_URL || DEFAULT_PORTAL_API_BASE_URL;
}

export async function runPortalDeployment({ deployment, website }) {
  try {
    const response = await fetch(`${getPortalApiBaseUrl()}/api/portal/deployments/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deployment, website }),
    });

    const payload = await response.json();
    return {
      ok: response.ok && payload.ok !== false,
      ...payload,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      offline: true,
      message: error.message || 'Portal deployment API is unavailable.',
    };
  }
}
