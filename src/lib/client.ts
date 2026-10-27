"use client";

/**
 * Browser API client. Attaches the CSRF token from the readable cookie to every
 * mutating request and turns error envelopes into thrown Errors the UI can show
 * directly — the server already made those messages customer-safe.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)ezp_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? (options.body ? "POST" : "GET");

  const res = await fetch(path, {
    method,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "x-csrf-token": csrfToken() } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: "same-origin",
  });

  if (res.headers.get("content-type")?.includes("text/csv")) {
    return (await res.blob()) as T;
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok || json?.ok === false) {
    const error = json?.error ?? {};
    throw new ApiError(
      error.message ?? "Something went wrong. Please try again.",
      error.code ?? "error",
      res.status,
      error.details,
    );
  }

  return json.data as T;
}

export function downloadCsv(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
