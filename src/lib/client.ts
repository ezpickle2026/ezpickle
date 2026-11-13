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

export function csrfToken(): string {
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

/** Uploads an image Blob to the admin media endpoint and returns its public URL. */
export async function uploadImage(
  file: Blob,
  filename = "photo.jpg",
  endpoint = "/api/admin/media/upload",
): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "x-csrf-token": csrfToken() },
    body: form,
    credentials: "same-origin",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    const error = json?.error ?? {};
    throw new ApiError(
      error.message ?? "Upload failed. Please try again.",
      error.code ?? "error",
      res.status,
    );
  }
  return json.data.url as string;
}

/**
 * Shrinks big images before upload. Photos become web-friendly JPEGs (longest
 * side 2000px). With { format: "png" } (used for logos) transparency is kept.
 * Falls back to the original file if the browser cannot decode it.
 */
export async function prepareImage(
  file: File,
  options: { maxSide?: number; format?: "jpeg" | "png" } = {},
): Promise<{ blob: Blob; name: string }> {
  const maxSide = options.maxSide ?? 2000;
  const png = options.format === "png";
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    if (!png) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", 0.85),
    );
    if (blob && (png || blob.size < file.size || file.size > 8 * 1024 * 1024)) {
      return { blob, name: file.name.replace(/\.[^.]+$/, "") + (png ? ".png" : ".jpg") };
    }
  } catch {
    /* fall through to the original file */
  }
  return { blob: file, name: file.name };
}
