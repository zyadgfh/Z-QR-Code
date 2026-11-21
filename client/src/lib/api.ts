import { useAuth } from '../stores/auth';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* لا يوجد JSON */
  }
  if (!res.ok) {
    const err = json?.error || {};
    if (res.status === 401 && token) useAuth.getState().logout();
    throw new ApiError(res.status, err.code || 'ERROR', err.message || 'حدث خطأ غير متوقع، حاول مرة أخرى');
  }
  return json as T;
}

export const API_BASE = BASE;
