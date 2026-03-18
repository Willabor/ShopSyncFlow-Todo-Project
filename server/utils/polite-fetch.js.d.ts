type PoliteFetcherOptions = {
  minDelayMs?: number;
  maxDelayMs?: number;
  maxRetries?: number;
  retryStatusCodes?: number[];
};

export declare class PoliteFetcher {
  constructor(options?: PoliteFetcherOptions);
  fetch(url: string, init?: RequestInit): Promise<Response>;
}
