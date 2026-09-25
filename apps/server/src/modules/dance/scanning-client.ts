import { isValidExternalScore } from "@bnewapp/dance-core";

export const SCAN_TIMEOUT_MS = 90_000;
export const SCAN_FAILOVER_DELAY_MS = 1_000;

/**
 * How much of a failed response body is kept. A scan server explains a 500 in its body
 * and nowhere else, so discarding it leaves "HTTP 500" as the whole diagnosis; keeping
 * all of it would put an HTML error page in a log line and a database column.
 */
export const SCAN_RESPONSE_BODY_LIMIT = 200;

/** One configured scan server, tried once — recorded whether it answered or failed. */
export interface ScanServerAttempt {
  /** Position in the configured URL list, so a log line can name a server without its URL. */
  index: number;
  url: string;
  durationMs: number;
  /** Absent when no response was produced at all: a timeout, DNS or connection failure. */
  httpStatus?: number | undefined;
  /**
   * What the server actually said, truncated and whitespace-collapsed. Recorded only
   * for an attempt that failed with a response, since the body of a success is the
   * score already recorded beside it.
   */
  responseBody?: string | undefined;
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
  /** The winning call alone, with no failover ahead of it counted. */
  durationMs: number;
  /**
   * The whole `scan` call: every server tried, plus the delay between them. The one to
   * read for "how long did scoring take" — `durationMs` omits a failover, so on a
   * 90-second timeout followed by a fast answer the two differ by two orders of magnitude.
   */
  totalDurationMs: number;
  /** Every server tried in this call, in order: the failovers ahead of the winner included. */
  attempts: readonly ScanServerAttempt[];
}

export class ScanRequestError extends Error {
  #attempts: readonly ScanServerAttempt[];
  #totalDurationMs: number;

  constructor(message: string, attempts: readonly ScanServerAttempt[], totalDurationMs: number) {
    super(message);
    this.name = "ScanRequestError";
    this.#attempts = attempts;
    this.#totalDurationMs = totalDurationMs;
  }

  /**
   * A getter, not a public field: pino's error serializer copies own enumerable
   * properties, and a field here would print the whole attempt list a second time
   * inside `err` on every line that already logs it as `serverAttempts`.
   */
  get attempts(): readonly ScanServerAttempt[] {
    return this.#attempts;
  }

  /** How long every server together took before the call gave up. */
  get totalDurationMs(): number {
    return this.#totalDurationMs;
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
    .map((attempt) => {
      const cause = attempt.error ?? "no error";
      const detail =
        attempt.responseBody === undefined ? cause : `${cause} — ${attempt.responseBody}`;
      return `[${attempt.index}] ${attempt.url}: ${detail}`;
    })
    .join("; ");
}

/** Collapsed to one line: an error body is often an HTML page, and this reaches a log. */
function bodySnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, SCAN_RESPONSE_BODY_LIMIT);
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
      const callStartedAt = Date.now();
      if (urls.length === 0) {
        throw new ScanRequestError("No scan server URLs are configured", [], 0);
      }

      const attempts: ScanServerAttempt[] = [];
      for (const [index, url] of urls.entries()) {
        const startedAt = Date.now();
        let httpStatus: number | undefined;
        let responseBody: string | undefined;
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
          // Read as text and parse here rather than calling `response.json()`: the body
          // is then still in hand when it is an error page or an unusable score, which
          // is exactly when its content is the only thing that explains the failure.
          const text = await response.text();
          responseBody = bodySnippet(text);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload: unknown = JSON.parse(text);
          const score =
            typeof payload === "object" && payload !== null && "score" in payload
              ? payload.score
              : undefined;
          if (!isValidExternalScore(score)) throw new Error("Invalid scan score");
          const durationMs = Date.now() - startedAt;
          attempts.push({ index, url, durationMs, httpStatus });
          return {
            attempts,
            durationMs,
            index,
            score,
            totalDurationMs: Date.now() - callStartedAt,
            url,
          };
        } catch (error) {
          attempts.push({
            index,
            url,
            durationMs: Date.now() - startedAt,
            httpStatus,
            responseBody,
            error: error instanceof Error ? error.message : "Unknown scan error",
          });
          if (index < urls.length - 1) await sleep(SCAN_FAILOVER_DELAY_MS);
        }
      }
      throw new ScanRequestError(
        `All scan servers failed: ${describeAttempts(attempts)}`,
        attempts,
        Date.now() - callStartedAt,
      );
    },
  };
}
