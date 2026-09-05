/**
 * Typed client for the gold-trading API. Every call goes to this origin's
 * `/api/*`, which Next proxies to Laravel (next.config.ts). Responses are
 * never cached. Any non-2xx reply is turned into an `ApiError` carrying the
 * envelope's `code`, `message` and `details`; network failures become
 * `ApiError` with code `NETWORK` so callers handle one error type.
 */
import type {
  ApiErrorBody,
  DemoBalancesRequest,
  DemoBalancesResponse,
  DemoSettings,
  DemoSettingsPatch,
  DemoSettingsResponse,
  IntegrityReport,
  PriceView,
  Quote,
  QuoteRequest,
  Receipt,
  StateResponse,
  Trade,
} from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Normalises anything thrown around a request into an `ApiError`. */
  static from(err: unknown): ApiError {
    if (err instanceof ApiError) return err;
    const message =
      err instanceof Error ? err.message : "Something went wrong";
    return new ApiError("UNKNOWN", message, 0);
  }
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return false;
  }
  const error = (body as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "NETWORK",
      "Could not reach the server. Check your connection and try again.",
      0,
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text !== "") {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    if (isErrorBody(parsed)) {
      throw new ApiError(
        parsed.error.code,
        parsed.error.message,
        response.status,
        parsed.error.details,
      );
    }
    throw new ApiError(
      "HTTP_ERROR",
      `The server answered with an unexpected ${response.status}.`,
      response.status,
    );
  }

  return parsed as T;
}

export function getState(): Promise<StateResponse> {
  return request("/api/state");
}

/** Triggers the API's lazy refresh when the 5-minute window has elapsed. */
export function getPrice(): Promise<PriceView> {
  return request("/api/price");
}

export function issueQuote(body: QuoteRequest): Promise<Quote> {
  return request("/api/quotes", "POST", body);
}

export function getQuote(id: string): Promise<Quote> {
  return request(`/api/quotes/${encodeURIComponent(id)}`);
}

export function confirmQuote(id: string): Promise<Receipt> {
  return request(`/api/quotes/${encodeURIComponent(id)}/confirm`, "POST");
}

/** Newest 25 trades. */
export function getTrades(): Promise<Trade[]> {
  return request("/api/trades");
}

export function getTrade(id: string): Promise<Receipt> {
  return request(`/api/trades/${encodeURIComponent(id)}`);
}

export function getIntegrity(): Promise<IntegrityReport> {
  return request("/api/integrity");
}

/** Reviewer tools — demo-only endpoints, not part of the product. */
export const demo = {
  getSettings(): Promise<DemoSettings> {
    return request("/api/demo/settings");
  },
  updateSettings(patch: DemoSettingsPatch): Promise<DemoSettingsResponse> {
    return request("/api/demo/settings", "PUT", patch);
  },
  /** Fetches both sources now, bypassing the 5-minute cache. */
  refresh(): Promise<PriceView> {
    return request("/api/demo/price/refresh", "POST");
  },
  setBalances(targets: DemoBalancesRequest): Promise<DemoBalancesResponse> {
    return request("/api/demo/balances", "POST", targets);
  },
  expireQuote(id: string): Promise<Quote> {
    return request(`/api/demo/quotes/${encodeURIComponent(id)}/expire`, "POST");
  },
  reset(): Promise<{ ok: true }> {
    return request("/api/demo/reset", "POST");
  },
};
