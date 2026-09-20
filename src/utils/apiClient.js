// Backend API istemcisi. Aynı origin'de (Railway tek servis) BASE boş kalır;
// API ayrı domainde ise REACT_APP_API_URL ile verilir (cookie için credentials: include).
const BASE = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }

  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    // JSON olmayan cevap (örn. HTML 404) → aşağıda kod ile ele alınır
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.code || (response.status === 404 ? 'NOT_FOUND' : 'API_ERROR'),
      data?.error || response.statusText
    );
  }
  return data;
}

export const encodeId = (id) => encodeURIComponent(String(id));
