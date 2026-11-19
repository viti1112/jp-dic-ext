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
