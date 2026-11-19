/**
 * Parses a `Response`'s JSON body, returning `null` (rather than throwing)
 * if it isn't valid JSON - the one place both `utils/anki.ts` and
 * `utils/claude.ts` fall back to when a local service or a remote API
 * answers with something unparseable (an HTML error page, an empty body).
 */
export async function parseJsonBody<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * `fetch()` with no timeout of its own, so a server that accepts the
 * connection but never answers (a frozen Anki process, a stalled API) would
 * otherwise hang the caller indefinitely - the add-card/example buttons would
 * sit on "..." forever with no way to tell the user anything went wrong.
 * Aborting surfaces as a `DOMException` from `fetch()` itself, which every
 * caller here already treats the same as "never got an answer" (`unreachable`).
 */
export async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
