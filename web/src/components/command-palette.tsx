"use client";

import clsx from "clsx";
import { CornerDownLeft, Crosshair, ListTree, Package, ScanLine, Search, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Kbd } from "@/components/ui";

interface Item {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: typeof Search;
}

export function CommandPalette({
  open,
  onClose,
  org,
  project,
}: {
  open: boolean;
  onClose: () => void;
  org: string;
  project?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      setActive(0);
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const base = project ? `/${org}/${project}` : `/${org}`;
    const pages: Item[] = project
      ? [
          { id: "findings", label: "Findings", href: `${base}/findings`, icon: Crosshair },
          { id: "deps", label: "Dependencies", href: `${base}/dependencies`, icon: Package },
          { id: "scans", label: "Scans", href: `${base}/scans`, icon: ScanLine },
          { id: "disclosures", label: "Disclosures", href: `${base}/disclosures`, icon: Send },
          {
            id: "validate",
            label: "Findings that need validation",
            href: `${base}/findings?status=needs_validation`,
            icon: Crosshair,
          },
        ]
      : [];
    pages.push({ id: "audit", label: "Audit log", href: `/${org}/audit`, icon: ListTree });
    pages.push({ id: "projects", label: "All projects", href: `/${org}`, icon: Search });

    const q = query.trim();
    const num = q.match(/^(?:fnd-?)?0*(\d{1,6})$/i);
    const jump: Item[] =
      project && num
        ? [
            {
              id: "jump",
              label: `Open FND-${num[1]!.padStart(6, "0")}`,
              hint: "Finding",
              href: `${base}/findings/FND-${num[1]!.padStart(6, "0")}`,
              icon: CornerDownLeft,
            },
          ]
        : [];
    const filtered = pages.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()));
    return [...jump, ...filtered];
  }, [org, project, query]);

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      aria-label="Command palette"
      className="border-rule bg-raised text-ink mx-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] rounded-lg border p-0 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] backdrop:bg-[rgba(10,12,16,0.45)]"
    >
      <div className="border-rule flex items-center gap-2.5 border-b px-4">
        <Search className="text-muted size-4" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(items[active]);
            }
          }}
          placeholder="Jump to a page or type a finding number"
          aria-label="Search"
          aria-controls="palette-results"
          className="placeholder:text-muted h-12 flex-1 bg-transparent outline-none"
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <li className="text-muted px-3 py-6 text-center">
            No matches. Try a page name or a number like 127.
          </li>
        ) : (
          items.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={clsx(
                  "flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-left",
                  i === active && "bg-vg-soft",
                )}
              >
                <item.icon className="text-muted size-4" aria-hidden />
                <span className={clsx(item.id === "jump" && "mono")}>{item.label}</span>
                {item.hint ? <span className="text-muted ml-auto text-xs">{item.hint}</span> : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </dialog>
  );
}
