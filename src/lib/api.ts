import { auth } from './firebase.ts';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...authHeaders,
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export async function apiDownload(url: string, fallbackFilename: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, { headers: authHeaders });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'Download failed');
    throw new Error(errText);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
