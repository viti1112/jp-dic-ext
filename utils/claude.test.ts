import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateExampleSentences } from './claude.ts';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe('generateExampleSentences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns no-api-key without making a network call when no key is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await generateExampleSentences('', '読む', 'よむ', 'to read');
    expect(result).toEqual({ ok: false, reason: 'no-api-key' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('parses one sentence per line from the response text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: '本を読む。\n\n毎日新聞を読みます。' }] })),
    );

    const result = await generateExampleSentences('sk-test', '読む', 'よむ', 'to read');
    expect(result).toEqual({ ok: true, sentences: ['本を読む。', '毎日新聞を読みます。'] });
  });

  it('caps at 2 sentences even if the model returns more', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ content: [{ type: 'text', text: 'A\nB\nC\nD' }] })));

    const result = await generateExampleSentences('sk-test', '読む', 'よむ', 'to read');
    expect(result).toEqual({ ok: true, sentences: ['A', 'B'] });
  });

  it('reports unreachable when fetch itself throws (offline, CORS, ...)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const result = await generateExampleSentences('sk-test', '読む', 'よむ', 'to read');
    expect(result).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('reports rejected with the API error message on a bad key / rate limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'invalid x-api-key' } }, false, 401)),
    );

    const result = await generateExampleSentences('sk-bad', '読む', 'よむ', 'to read');
    expect(result).toEqual({ ok: false, reason: 'rejected', message: 'invalid x-api-key' });
  });

  it('reports rejected (not unreachable) when a 200 response body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      })),
    );

    const result = await generateExampleSentences('sk-test', '読む', 'よむ', 'to read');
    expect(result).toEqual({ ok: false, reason: 'rejected', message: 'Could not parse the API response.' });
  });

  it('reports rejected (not unreachable) for a non-OK response with a non-JSON body, e.g. an outage HTML page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      })),
    );

    const result = await generateExampleSentences('sk-test', '読む', 'よむ', 'to read');
    expect(result).toEqual({ ok: false, reason: 'rejected', message: 'HTTP 503' });
  });

  it('sends the api key and model in the request', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({ content: [{ type: 'text', text: '本を読む。' }] }));
    vi.stubGlobal('fetch', fetchSpy);

    await generateExampleSentences('sk-test', '読む', 'よむ', 'to read');

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.messages[0].content).toContain('読む');
  });
});
