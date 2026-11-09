/**
 * Minimal HTTP layer shared by the API clients.
 *
 * The engine never calls `fetch` directly: the desktop app injects Tauri's
 * plugin-http fetch (which goes through Rust, so we may set a User-Agent as
 * Modrinth requires), and tests inject a mock.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

/** Simple async semaphore so we never hammer an API with hundreds of parallel calls. */
export class Limiter {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface JsonClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  headers?: Record<string, string>;
  concurrency?: number;
  retries?: number;
}

export class JsonClient {
  private readonly limiter: Limiter;
  constructor(private readonly opts: JsonClientOptions) {
    this.limiter = new Limiter(opts.concurrency ?? 6);
  }

  async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const url = this.opts.baseUrl + path;
    const retries = this.opts.retries ?? 3;
    return this.limiter.run(async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await this.opts.fetch(url, {
          method,
          headers: {
            Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...this.opts.headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (res.ok) return (await res.json()) as T;
        // 404 is a normal answer for hash lookups ("not on this platform").
        if (res.status === 404) throw new HttpError(404, url, "");
        // Rate limited or transient: back off and retry.
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
          continue;
        }
        throw new HttpError(res.status, url, await res.text().catch(() => ""));
      }
    });
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body: unknown) {
    return this.request<T>("POST", path, body);
  }
}

export const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
};
