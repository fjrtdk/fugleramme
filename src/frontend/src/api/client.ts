export interface ApiResponse<T> {
  data?: T;
  error?: { code: string; message: string };
  status: number;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
      credentials: 'include', // send httpOnly cookie
      headers: {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) ?? {}),
      },
      ...options,
    });

    if (res.status === 204) {
      return { status: 204 };
    }

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        status: res.status,
        error: (body as { error?: { code: string; message: string } })?.error ?? {
          code: 'UNKNOWN',
          message: 'Request failed',
        },
      };
    }

    return { status: res.status, data: body as T };
  } catch (_err) {
    return { status: 0, error: { code: 'NETWORK_ERROR', message: 'Network error' } };
  }
}
