"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
      aria-labelledby="dialog-title"
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      className="border-rule bg-raised text-ink m-auto rounded-lg border p-0 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] backdrop:bg-[rgba(10,12,16,0.45)]"
    >
      <div className="border-rule flex items-start gap-3 border-b px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="dialog-title" className="text-[15px] leading-[22px] font-semibold">
            {title}
          </h2>
          {description ? <p className="text-muted text-[13px]">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:bg-rule hover:text-ink -mr-1.5 ml-auto inline-flex size-8 items-center justify-center rounded-md"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer ? <div className="border-rule flex justify-end gap-2 border-t px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}
