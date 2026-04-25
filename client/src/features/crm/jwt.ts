function base64UrlToUtf8(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function tryGetEmailFromJwt(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = base64UrlToUtf8(parts[1] ?? '');
    const payload = JSON.parse(payloadJson) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export function tryGetRolesFromJwt(token: string): string[] {
  const parts = token.split('.');
  if (parts.length < 2) return [];
  try {
    const payloadJson = base64UrlToUtf8(parts[1] ?? '');
    const payload = JSON.parse(payloadJson) as { roles?: unknown };
    return Array.isArray(payload.roles) ? payload.roles.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
