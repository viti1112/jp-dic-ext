import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, parseJsonBody } from './http.ts';

describe('parseJsonBody', () => {
  it('returns the parsed body', async () => {
    const response = { json: async () => ({ hello: 'world' }) } as unknown as Response;
    expect(await parseJsonBody(response)).toEqual({ hello: 'world' });
  });

  it('returns null instead of throwing when the body is not valid JSON', async () => {
    const response = {
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response;
    expect(await parseJsonBody(response)).toBeNull();
  });
});

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves normally when the request finishes well within the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok')),
    );
    const response = await fetchWithTimeout('https://example.com', {}, 5000);
    expect(await response.text()).toBe('ok');
  });

  it('aborts the request once the timeout elapses, surfacing as a fetch-level rejection', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          }),
      ),
    );

    const pending = fetchWithTimeout('https://example.com', {}, 1000);
    const assertion = expect(pending).rejects.toThrow('Aborted');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('passes an AbortSignal through to fetch so a slow server can be cut off', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchWithTimeout('https://example.com', {}, 5000);

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
