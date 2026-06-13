const DEFAULT_API_BASE = '';

function getApiBase() {
  return import.meta.env.VITE_PORTAL_API_BASE_URL ?? DEFAULT_API_BASE;
}

export async function publishPreparedContentWrite(preparedWrite) {
  if (!preparedWrite?.contentFilePath || !preparedWrite?.serialisedContent) {
    return {
      ok: false,
      message: 'Prepared Git write metadata is missing contentFilePath or serialisedContent.',
    };
  }

  try {
    const response = await fetch(`${getApiBase()}/api/portal/content/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preparedWrite }),
    });

    const payload = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        message: payload?.message ?? 'Content publish API failed.',
        details: payload,
      };
    }

    return payload;
  } catch (error) {
    return {
      ok: false,
      message: 'Content publish API is not available yet. The portal kept the prepared Git write metadata for backend publishing.',
      details: error.message,
    };
  }
}
