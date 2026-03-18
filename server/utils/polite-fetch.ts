import { setTimeout as sleep } from "node:timers/promises";

type PoliteFetcherOptions = {
  minDelayMs?: number;
  maxDelayMs?: number;
  maxRetries?: number;
  retryStatusCodes?: number[];
};

const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
];

const envNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export class PoliteFetcher {
  private lastRequestTime = 0;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxRetries: number;
  private readonly retryStatusCodes: Set<number>;

  constructor(options: PoliteFetcherOptions = {}) {
    const envMin = envNumber(process.env.SCRAPER_MIN_DELAY_MS, 2000);
    const envMax = envNumber(process.env.SCRAPER_MAX_DELAY_MS, 5000);

    this.minDelayMs = options.minDelayMs ?? envMin;
    this.maxDelayMs = Math.max(options.maxDelayMs ?? envMax, this.minDelayMs + 250);
    this.maxRetries = options.maxRetries ?? envNumber(process.env.SCRAPER_MAX_RETRIES, 3);
    this.retryStatusCodes = new Set(options.retryStatusCodes ?? [403, 429, 503]);
  }

  private getRandomDelay(): number {
    const jitter = Math.random() * (this.maxDelayMs - this.minDelayMs);
    return this.minDelayMs + jitter;
  }

  private async waitForTurn(): Promise<void> {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;

    if (timeSinceLast < this.minDelayMs) {
      await sleep(this.minDelayMs - timeSinceLast);
    }

    await sleep(this.getRandomDelay());
    this.lastRequestTime = Date.now();
  }

  private pickUserAgent(): string {
    const index = Math.floor(Math.random() * DEFAULT_USER_AGENTS.length);
    return DEFAULT_USER_AGENTS[index];
  }

  private async backoffDelay(attempt: number): Promise<void> {
    const base = Math.min(8000, 1000 * 2 ** attempt);
    const jitter = Math.random() * 500;
    await sleep(base + jitter);
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        await this.waitForTurn();

        const headers = new Headers(init.headers ?? {});
        if (!headers.has("User-Agent")) {
          headers.set("User-Agent", this.pickUserAgent());
        }
        if (!headers.has("Accept-Language")) {
          headers.set("Accept-Language", "en-US,en;q=0.9");
        }
        if (!headers.has("Accept")) {
          headers.set("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
        }

        const response = await fetch(url, { ...init, headers });

        if (this.retryStatusCodes.has(response.status) && attempt < this.maxRetries) {
          await this.backoffDelay(attempt);
          attempt += 1;
          continue;
        }

        return response;
      } catch (error) {
        if (attempt >= this.maxRetries) {
          throw error;
        }

        await this.backoffDelay(attempt);
        attempt += 1;
      }
    }

    throw new Error("PoliteFetcher exhausted retries without a response");
  }
}
