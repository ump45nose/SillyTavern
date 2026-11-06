import React, { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "./icons";
import { popoverPlacement } from "./placement";
import { useAnchoredLayer } from "./useAnchoredLayer";
export function Popover({
  anchor,
  title,
  onClose,
  children,
  tools,
  exiting,
  className = "",
}: {
  anchor: HTMLElement;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  tools?: React.ReactNode;
  exiting?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const style = useAnchoredLayer(anchor, ref, {
    placement: popoverPlacement,
    onDismiss: onClose,
    escape: true,
  });
  useLayoutEffect(() => {
    const el = ref.current!;
    const focusFrame = requestAnimationFrame(() => {
      const target = el.querySelector<HTMLElement>(
        "input:not([type=file]):not([type=hidden]),.wb-pop-row:not(:disabled),button:not(:disabled)",
      );
      target?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(focusFrame);
      if (el.contains(document.activeElement)) anchor.focus({ preventScroll: true });
      anchor.setAttribute("aria-expanded", "false");
    };
  }, [anchor]);
  useLayoutEffect(() => {
    anchor.setAttribute("aria-expanded", String(!exiting));
  }, [anchor, exiting]);
  return createPortal(
    <div
      ref={ref}
      className={`wb-ui wb-popover ${className}`}
      data-wb-exiting={exiting || undefined}
      inert={exiting}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={style}
    >
      <header>
        <strong>{title}</strong>
        <span className="wb-grow" />
        {tools}
        <button className="wb-icon" aria-label="关闭弹出框" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {children}
    </div>,
    anchor.closest("dialog[open]") || document.body,
  );
}
