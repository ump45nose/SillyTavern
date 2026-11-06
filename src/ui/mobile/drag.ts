type Point = { clientX: number; clientY: number };

/**
 * A drag along one axis, from its press through each recorded move. Its velocity is that of the last
 * two samples, the press counting as the first, so a finger that stops before lifting has none.
 */
export function trackDrag(axis: "x" | "y", from: Point, t: number) {
  const along = (point: Point) => (axis === "x" ? point.clientX : point.clientY);
  const start = along(from);
  let previous = { at: start, t },
    last = previous;
  const velocity = () => (last.at - previous.at) / Math.max(1, last.t - previous.t);
  return {
    move(point: Point, t: number) {
      previous = last;
      last = { at: along(point), t };
    },
    get delta() {
      return last.at - start;
    },
    /** In px/ms, positive along the axis. */
    get velocity() {
      return velocity();
    },
    /** 1 or -1 when the last motion was faster than `threshold` along or against the axis, otherwise 0. */
    flick(threshold: number) {
      const v = velocity();
      return v > threshold ? 1 : v < -threshold ? -1 : 0;
    },
  };
}

export type DragTrack = ReturnType<typeof trackDrag>;
