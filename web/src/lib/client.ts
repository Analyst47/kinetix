"use client";

import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function csrfToken(): Promise<string> {
  const existing = readCookie("kx_csrf");
  if (existing) return existing;
  const res = await fetch("/api/v1/auth/csrf", { credentials: "same-origin" });
  return ((await res.json()) as { csrf_token: string }).csrf_token;
}

/** Browser-side API call. Unsafe methods carry the CSRF token the API expects. */
export async function call<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  let payload: BodyInit | undefined;
  if (method !== "GET") headers["X-CSRF-Token"] = await csrfToken();
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: payload,
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "unknown",
      err?.message ?? "Something went wrong. Try again.",
      err?.details,
    );
  }
  return data as T;
}
