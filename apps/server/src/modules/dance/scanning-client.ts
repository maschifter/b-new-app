import { isValidExternalScore } from "@bnewapp/dance-core";

export const SCAN_TIMEOUT_MS = 90_000;
export const SCAN_FAILOVER_DELAY_MS = 1_000;

/** One configured scan server, tried once — recorded whether it answered or failed. */
export interface ScanServerAttempt {
  /** Position in the configured URL list, so a log line can name a server without its URL. */
  index: number;
  url: string;
  durationMs: number;
  /** Absent when no response was produced at all: a timeout, DNS or connection failure. */
  httpStatus?: number | undefined;
  /** Absent on the attempt that produced the score. */
  error?: string | undefined;
}

/**
 * A score and where it came from. The bare number this replaces left the configured
 * servers indistinguishable after the fact, which is the first thing an unexpected
 * score needs answered.
 */
export interface ScanOutcome {
  score: number;
  /** The server that produced the score, and its position in the configured list. */
  url: string;
  index: number;
  durationMs: number;
  /** Every server tried in this call, in order: the failovers ahead of the winner included. */
  attempts: readonly ScanServerAttempt[];
}

export class ScanRequestError extends Error {
  #attempts: readonly ScanServerAttempt[];

  constructor(message: string, attempts: readonly ScanServerAttempt[]) {
    super(message);
    this.name = "ScanRequestError";
    this.#attempts = attempts;
  }

  /**
   * A getter, not a public field: pino's error serializer copies own enumerable
   * properties, and a field here would print the whole attempt list a second time
   * inside `err` on every line that already logs it as `serverAttempts`.
   */
  get attempts(): readonly ScanServerAttempt[] {
    return this.#attempts;
  }
}

interface ScanRequest {
  amateurUrl: string;
  expertUrl: string;
  jobId: string;
}

interface ScanningClientOptions {
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

/**
 * Folded into the thrown message as well as carried structurally, because the worker
 * stores `error.message` in `dance_scans.error` and "All scan servers failed" alone
 * cannot say which server failed how.
 */
function describeAttempts(attempts: readonly ScanServerAttempt[]): string {
  return attempts
    .map((attempt) => `[${attempt.index}] ${attempt.url}: ${attempt.error ?? "no error"}`)
    .join("; ");
}

export function createScanningClient(options: ScanningClientOptions) {
  const urls = parseServerUrls(options.serverUrls);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxDurationMs =
    urls.length === 0
      ? 0
      : urls.length * SCAN_TIMEOUT_MS + (urls.length - 1) * SCAN_FAILOVER_DELAY_MS;

  return {
    maxDurationMs,
    async scan(request: ScanRequest): Promise<ScanOutcome> {
      if (urls.length === 0) {
        throw new ScanRequestError("No scan server URLs are configured", []);
      }

      const attempts: ScanServerAttempt[] = [];
      for (const [index, url] of urls.entries()) {
        const startedAt = Date.now();
        let httpStatus: number | undefined;
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
          httpStatus = response.status;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload: unknown = await response.json();
          const score =
            typeof payload === "object" && payload !== null && "score" in payload
              ? payload.score
              : undefined;
          if (!isValidExternalScore(score)) throw new Error("Invalid scan score");
          const durationMs = Date.now() - startedAt;
          attempts.push({ index, url, durationMs, httpStatus });
          return { score, url, index, durationMs, attempts };
        } catch (error) {
          attempts.push({
            index,
            url,
            durationMs: Date.now() - startedAt,
            httpStatus,
            error: error instanceof Error ? error.message : "Unknown scan error",
          });
          if (index < urls.length - 1) await sleep(SCAN_FAILOVER_DELAY_MS);
        }
      }
      throw new ScanRequestError(
        `All scan servers failed: ${describeAttempts(attempts)}`,
        attempts,
      );
    },
  };
}
