"use client";

import { useSyncExternalStore } from "react";

import { shortDate } from "@/lib/format";

const utcDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const subscribeNever = () => () => {};

/**
 * A short date ("Jan 8") for client components that are also server-rendered. The server and
 * the hydration pass both format in UTC, so they always agree; after hydration it switches to
 * the viewer's own time zone.
 */
export function ShortDate({ iso }: { iso: string }) {
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return <time dateTime={iso}>{hydrated ? shortDate(iso) : utcDate.format(new Date(iso))}</time>;
}
