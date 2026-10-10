"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** False while work is in flight: Escape and the close button are held off until it settles. */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Several dialogs can share a page (the shell mounts two), so each needs its own title id.
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      aria-labelledby={titleId}
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      className="border-rule bg-raised text-ink m-auto rounded-2xl border p-0 backdrop:bg-black/60"
    >
      <div className="border-rule flex items-start gap-3 border-b px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 id={titleId} className="text-[15px] leading-[22px] font-semibold">
            {title}
          </h2>
          {description ? <p className="text-muted text-[13px]">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={!dismissible}
          aria-label="Close"
          className="text-muted hover:bg-ink/[0.06] hover:text-ink -mr-1.5 ml-auto inline-flex size-8 items-center justify-center rounded-full disabled:opacity-40"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer ? <div className="border-rule flex justify-end gap-2 border-t px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}
