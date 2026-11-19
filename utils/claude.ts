const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Fast and cheap - a good fit for a short, one-shot example-sentence request.
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_EXAMPLES = 2;

export type GenerateExamplesResult =
  | { ok: true; sentences: string[] }
  /** No API key configured yet (see the options page) - distinct from a real network/API failure. */
  | { ok: false; reason: 'no-api-key' }
  /** The request never got an answer at all (offline, DNS, CORS). */
  | { ok: false; reason: 'unreachable' }
  /** The API answered with an error (bad key, rate limit, ...). */
  | { ok: false; reason: 'rejected'; message: string };

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

/**
 * Asks Claude for a couple of natural example sentences using a dictionary
 * entry's headword - the user's own API key, used only for this one request
 * straight to api.anthropic.com (see `wxt.config.ts`'s host_permissions).
 */
export async function generateExampleSentences(
  apiKey: string,
  headword: string,
  reading: string,
  gloss: string,
): Promise<GenerateExamplesResult> {
  if (!apiKey) return { ok: false, reason: 'no-api-key' };

  const prompt = `Write ${MAX_EXAMPLES} short, natural Japanese example sentences using the word "${headword}" (reading: ${reading}, meaning: "${gloss}"). Reply with just the sentences themselves, one per line, no numbering, no translations, no markdown.`;

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        // Required for any direct browser/extension call - Anthropic's API
        // otherwise rejects cross-origin requests outright.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  let body: AnthropicMessageResponse;
  try {
    body = (await response.json()) as AnthropicMessageResponse;
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  if (!response.ok || body.error) {
    return { ok: false, reason: 'rejected', message: body.error?.message ?? `HTTP ${response.status}` };
  }

  const text = body.content?.find((block) => block.type === 'text')?.text ?? '';
  const sentences = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (sentences.length === 0) return { ok: false, reason: 'rejected', message: 'Empty response.' };
  return { ok: true, sentences: sentences.slice(0, MAX_EXAMPLES) };
}
