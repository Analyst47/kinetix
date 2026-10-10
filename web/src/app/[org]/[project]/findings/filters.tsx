"use client";

import { ChevronDown, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui";

const SEVERITY_OPTIONS = [
  { value: "", label: "Any severity" },
  { value: "critical", label: "Critical" },
  { value: "critical,high", label: "High and above" },
  { value: "critical,high,medium", label: "Medium and above" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "sast", label: "SAST" },
  { value: "dependency", label: "Dependency" },
  { value: "secret", label: "Secrets" },
  { value: "manual", label: "Manual" },
];

const AI_OPTIONS = [
  { value: "", label: "Any AI verdict" },
  { value: "likely_vulnerable", label: "AI: likely real" },
  { value: "needs_more_context", label: "AI: needs context" },
  { value: "likely_false_positive", label: "AI: likely false positive" },
];

export function FindingFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update("q", q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters =
    params.has("q") || params.has("severity") || params.has("source") || params.has("ai_verdict");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="border-rule-strong bg-raised text-muted focus-within:outline-brand flex h-8 flex-[0_1_320px] items-center gap-2 rounded-full border px-3 focus-within:outline-2">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by title, CWE or file"
          aria-label="Filter findings"
          className="text-ink placeholder:text-muted w-full bg-transparent outline-none"
        />
      </label>
      <Select
        label="Severity"
        value={params.get("severity") ?? ""}
        options={SEVERITY_OPTIONS}
        onChange={(v) => update("severity", v)}
      />
      <Select
        label="Source"
        value={params.get("source") ?? ""}
        options={SOURCE_OPTIONS}
        onChange={(v) => update("source", v)}
      />
      <Select
        label="AI verdict"
        value={params.get("ai_verdict") ?? ""}
        options={AI_OPTIONS}
        onChange={(v) => update("ai_verdict", v)}
      />
      {hasFilters ? (
        <Button
          variant="ghost"
          className="text-muted"
          onClick={() => {
            setQ("");
            const next = new URLSearchParams();
            const status = params.get("status");
            if (status) next.set("status", status);
            router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
          }}
        >
          Clear
        </Button>
      ) : null}
      <span className="text-muted ml-auto text-xs">Sorted by severity, then last update</span>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="border-rule-strong bg-raised hover:bg-paper focus-within:outline-brand relative inline-flex h-8 items-center rounded-md border focus-within:outline-2">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-ink h-full cursor-pointer appearance-none bg-transparent pr-8 pl-3 text-sm font-medium outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="text-muted pointer-events-none absolute right-2.5 size-4" aria-hidden />
    </label>
  );
}
