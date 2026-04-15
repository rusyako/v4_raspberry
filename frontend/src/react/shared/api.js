export class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok || (data && data.success === false)) {
    throw new ApiError(data?.message || `Request failed with ${response.status}`, response.status);
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
