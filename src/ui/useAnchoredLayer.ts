import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { place, placedWidth, type Placed, type Placement } from "./placement";

type Anchor = HTMLElement | RefObject<HTMLElement | null> | null;

export interface AnchoredLayerOptions {
  /** Omit when CSS places the layer. */
  placement?: Placement;
  /** A press outside the anchor and the layer, or Escape with `escape`. */
  onDismiss: () => void;
  /** Escape dismisses and returns focus to the anchor. */
  escape?: boolean;
  /** Presses are seen before page handlers can stop them. */
  capture?: boolean;
  /** Presses inside a match also count as inside. */
  within?: string;
}

/** Escape belongs to the overlay holding focus, unless that overlay holds this layer. */
const overlays =
  'dialog[open],.wb-mobile-resource-popup,.wb-resource-menu,.wb-popover,.wb-select-trigger[aria-expanded="true"]';

const resolve = (anchor: Anchor) => (anchor && "current" in anchor ? anchor.current : anchor);
const same = (a: Placed, b: Placed) =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.maxHeight === b.maxHeight;

/**
 * A layer opened from `anchor`, which is null while the layer is closed. The layer follows the anchor
 * through resizes and scrolls; once inert on its way out it ignores presses and keys. Returns the
 * layer's style, hidden until first placed.
 */
export function useAnchoredLayer(
  anchor: Anchor,
  layer: RefObject<HTMLElement | null>,
  options: AnchoredLayerOptions,
): CSSProperties {
  const latest = useRef(options),
    [placed, setPlaced] = useState<Placed | null>(null);
  latest.current = options;
  const placing = !!options.placement,
    { escape = false, capture = false } = options;
  useLayoutEffect(() => {
    if (!anchor) return;
    const position = () => {
      const target = resolve(anchor),
        el = layer.current,
        p = latest.current.placement;
      if (!target || !el || !p) return;
      const box = target.getBoundingClientRect(),
        view = { width: innerWidth, height: innerHeight },
        width = placedWidth(box, view, p);
      if (width !== undefined) el.style.width = `${width}px`;
      const own = el.getBoundingClientRect(),
        height = p.maxHeight === undefined ? own.height : el.scrollHeight + el.offsetHeight - el.clientHeight;
      const next = place(box, { width: own.width, height }, view, p);
      setPlaced((previous) => (previous && same(previous, next) ? previous : next));
    };
    const outside = (e: PointerEvent) => {
      const target = e.target as Element,
        el = layer.current,
        { within } = latest.current;
      if (el?.inert || el?.contains(target) || resolve(anchor)?.contains(target)) return;
      if (!within || !target.closest?.(within)) latest.current.onDismiss();
    };
    const key = (e: KeyboardEvent) => {
      const el = layer.current;
      if (e.key !== "Escape" || !el || el.inert) return;
      const owner = document.activeElement?.closest(overlays);
      if (owner && owner !== el && !owner.contains(el)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      latest.current.onDismiss();
      resolve(anchor)?.focus();
    };
    const observer = placing ? new ResizeObserver(position) : undefined;
    if (observer) {
      position();
      if (layer.current) observer.observe(layer.current);
      window.addEventListener("resize", position);
      window.addEventListener("scroll", position, true);
    }
    document.addEventListener("pointerdown", outside, capture);
    if (escape) document.addEventListener("keydown", key, true);
    return () => {
      if (observer) {
        observer.disconnect();
        window.removeEventListener("resize", position);
        window.removeEventListener("scroll", position, true);
      }
      document.removeEventListener("pointerdown", outside, capture);
      if (escape) document.removeEventListener("keydown", key, true);
    };
  }, [anchor, layer, placing, escape, capture]);
  return placed ? { ...placed, visibility: "visible" } : { left: 0, top: 0, visibility: "hidden" };
}
