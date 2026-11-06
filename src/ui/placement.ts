export type Side = "above" | "below";

/**
 * Where a layer opens beside its anchor, in window pixels. A layer without `maxHeight` keeps its own
 * height: it takes the other side when it does not fit, and is held inside the window. A layer with
 * `maxHeight` scrolls within the room on its side instead, and is not moved.
 */
export interface Placement {
  side: Side;
  /** Between the anchor and the layer. */
  gap: number;
  /** Kept clear at the window's edges. */
  margin: number;
  /** The layer's width, within the window; without it the layer keeps its own. */
  width?: number;
  /** The width grows to the anchor's. */
  matchAnchor?: boolean;
  maxHeight?: number;
  /** A scrolling layer gets at least this much, even past the room on its side. */
  minHeight?: number;
  /** A scrolling layer with less room than this takes the other side when that one is roomier. */
  flip?: number;
}

export interface Placed {
  left: number;
  top: number;
  width?: number;
  maxHeight?: number;
}

type Rect = { left: number; top: number; bottom: number; width: number };
type Size = { width: number; height: number };

/** Paper panels from the composer, reading bar and message menus. */
export const popoverPlacement: Placement = { side: "above", gap: 8, margin: 10 };
/** A select's listbox, as wide as its trigger and at least 180px. */
export const listPlacement: Placement = {
  side: "below",
  gap: 6,
  margin: 8,
  width: 180,
  matchAnchor: true,
  maxHeight: 260,
  minHeight: 80,
  flip: 150,
};
/** A resource picker's list always opens below its title. */
export const pickerPlacement: Placement = { side: "below", gap: 8, margin: 12, width: 340, maxHeight: 500 };

/** Set before the layer is measured, so a scrolling layer's height follows its wrapping. */
export function placedWidth(anchor: Rect, view: Size, p: Placement) {
  return p.width === undefined
    ? undefined
    : Math.min(Math.max(p.width, p.matchAnchor ? anchor.width : 0), view.width - 2 * p.margin);
}

/** `layer` is the layer's own size; a scrolling layer's height is that of its whole content. */
export function place(anchor: Rect, layer: Size, view: Size, p: Placement): Placed {
  const width = placedWidth(anchor, view, p),
    sized = width === undefined ? {} : { width };
  const room = {
    above: anchor.top - p.gap - p.margin,
    below: view.height - anchor.bottom - p.gap - p.margin,
  };
  const other: Side = p.side === "above" ? "below" : "above";
  const left = Math.max(p.margin, Math.min(anchor.left, view.width - (width ?? layer.width) - p.margin));
  const top = (side: Side, height: number) =>
    side === "below" ? anchor.bottom + p.gap : anchor.top - height - p.gap;
  if (p.maxHeight === undefined) {
    const side = room[p.side] >= layer.height ? p.side : other;
    return {
      left,
      top: Math.max(p.margin, Math.min(top(side, layer.height), view.height - layer.height - p.margin)),
      ...sized,
    };
  }
  const side = p.flip === undefined || room[p.side] >= p.flip || room[p.side] >= room[other] ? p.side : other;
  const maxHeight = Math.min(p.maxHeight, Math.max(p.minHeight ?? -Infinity, room[side]));
  return { left, top: top(side, Math.min(maxHeight, layer.height)), ...sized, maxHeight };
}
