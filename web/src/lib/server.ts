import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

const API_URL = process.env.KINETIX_API_URL ?? "http://localhost:8000";

/**
 * Server-side read from the API, forwarding the browser's session cookie.
 * 401 sends the user to sign in; 404 renders the not-found page.
 */
export async function api<T>(path: string): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { cookie: jar.toString(), accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401) redirect("/login");
  if (res.status === 404) notFound();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `API request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Like api(), but returns null on 404 instead of rendering the not-found page. */
export async function apiOptional<T>(path: string): Promise<T | null> {
  const jar = await cookies();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { cookie: jar.toString(), accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401) redirect("/login");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API request failed (${res.status})`);
  return res.json() as Promise<T>;
}
