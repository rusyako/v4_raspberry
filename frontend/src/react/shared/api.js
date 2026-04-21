export class ApiError extends Error {
  constructor(message, status = 500, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isNetworkTransportError(error) {
  if (error instanceof ApiError) {
    return error.code === 'NETWORK_ERROR' || error.status === 0;
  }

  return error instanceof TypeError;
}

export async function requestJson(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError('NETWORK_ERROR', 0, 'NETWORK_ERROR');
  }

  const contentType = response.headers.get('content-type') || '';
  let data = null;

  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Request failed with ${response.status}`,
      response.status,
      data?.code || 'API_ERROR'
    );
  }

  if (!data || data.success !== true) {
    throw new ApiError(
      data?.message || 'Unexpected API response format',
      response.status,
      data?.code || 'INVALID_API_RESPONSE'
    );
  }

  return data;
}

export function postJson(url, body, headers = {}) {
  return requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
}

export function deleteJson(url, headers = {}) {
  return requestJson(url, {
    method: 'DELETE',
    headers
  });
}
