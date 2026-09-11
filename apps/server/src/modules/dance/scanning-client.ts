import { isValidExternalScore } from "@bnewapp/dance-core";

export const SCAN_TIMEOUT_MS = 90_000;
export const SCAN_FAILOVER_DELAY_MS = 1_000;

export class ScanRequestError extends Error {
  constructor(message: string, readonly causes: readonly string[]) {
    super(message);
    this.name = "ScanRequestError";
  }
}

export interface ScanRequest {
  amateurUrl: string;
  expertUrl: string;
  jobId: string;
}

export interface ScanningClientOptions {
  fetchImpl?: typeof fetch;
  serverUrls: string;
  sleep?: (milliseconds: number) => Promise<void>;
}

function parseServerUrls(value: string): string[] {
  return value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createScanningClient(options: ScanningClientOptions) {
  const urls = parseServerUrls(options.serverUrls);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxDurationMs =
    urls.length === 0 ? 0 : urls.length * SCAN_TIMEOUT_MS + (urls.length - 1) * SCAN_FAILOVER_DELAY_MS;

  return {
    maxDurationMs,
    async scan(request: ScanRequest): Promise<number> {
      if (urls.length === 0) {
        throw new ScanRequestError("No scan server URLs are configured", []);
      }

      const causes: string[] = [];
      for (const [index, url] of urls.entries()) {
        try {
          const response = await fetchImpl(url, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              expert_url: request.expertUrl,
              amateur_url: request.amateurUrl,
              jobid: request.jobId,
            }),
            signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload: unknown = await response.json();
          const score =
            typeof payload === "object" && payload !== null && "score" in payload
              ? payload.score
              : undefined;
          if (!isValidExternalScore(score)) throw new Error("Invalid scan score");
          return score;
        } catch (error) {
          causes.push(error instanceof Error ? error.message : "Unknown scan error");
          if (index < urls.length - 1) await sleep(SCAN_FAILOVER_DELAY_MS);
        }
      }
      throw new ScanRequestError("All scan servers failed", causes);
    },
  };
}
