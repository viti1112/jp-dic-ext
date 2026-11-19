import { fetchWithTimeout, parseJsonBody } from './http.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Fast and cheap - a good fit for a short, one-shot example-sentence request.
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_EXAMPLES = 2;
const REQUEST_TIMEOUT_MS = 15_000;

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
    response = await fetchWithTimeout(
      ANTHROPIC_API_URL,
      {
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
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  const body = await parseJsonBody<AnthropicMessageResponse>(response);

  // A response that answered at all (even with a body we can't parse, or an
  // HTTP-level failure) is a rejection, not "unreachable" - "unreachable" is
  // reserved for when the request never got an answer at all. Conflating the
  // two would show the user a generic connectivity message during a real API
  // outage (e.g. a 503 with an HTML error page instead of JSON).
  if (!response.ok) {
    return { ok: false, reason: 'rejected', message: body?.error?.message ?? `HTTP ${response.status}` };
  }
  if (!body) return { ok: false, reason: 'rejected', message: 'Could not parse the API response.' };
  if (body.error) {
    return { ok: false, reason: 'rejected', message: body.error.message ?? 'Unknown error.' };
  }

  const text = body.content?.find((block) => block.type === 'text')?.text ?? '';
  const sentences = text
    .split('\n')
    .map(cleanLine)
    .filter((line) => JAPANESE_TEXT.test(line));

  if (sentences.length === 0) return { ok: false, reason: 'rejected', message: 'Empty response.' };
  return { ok: true, sentences: sentences.slice(0, MAX_EXAMPLES) };
}

// Hiragana, katakana, and CJK ideographs - a cheap "is this actually
// Japanese text" check. Not a literal headword/reading substring check: a
// natural example sentence conjugates the word (読む → 読みます), so it won't
// contain the dictionary-form headword verbatim, and rejecting on that basis
// would throw away perfectly good sentences.
const JAPANESE_TEXT = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;

/** Strips the model's occasional numbering/bullet/bold markdown ("1. ", "- ", "**...**") despite the prompt asking for plain lines, so that formatting never ends up rendered verbatim in the popup. */
function cleanLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .trim();
}
