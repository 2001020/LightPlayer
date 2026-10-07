/** What the transport bar's right side should hide to fit its width. */
export interface RowFit {
  /** How many foldable items, from the left, go into the "more" menu. */
  fold: number;
  /** Whether the volume slider shrinks to a button with a pop-up slider. */
  compactVolume: boolean;
}

/**
 * Widths include the gap after each element. The volume slider shrinks
 * first, then items fold from the left until the row fits. `alwaysMore`
 * keeps room for the "more" button even when nothing folds.
 */
export function fitRow({
  avail,
  items,
  pinned,
  volume,
  volumeIcon,
  more,
  alwaysMore = false,
}: {
  avail: number;
  items: number[];
  pinned: number;
  volume: number;
  volumeIcon: number;
  more: number;
  alwaysMore?: boolean;
}): RowFit {
  const rest = (k: number) => items.slice(k).reduce((a, b) => a + b, 0);
  const moreW = (k: number) => (k > 0 || alwaysMore ? more : 0);
  if (rest(0) + pinned + volume + moreW(0) <= avail) return { fold: 0, compactVolume: false };
  for (let k = 0; k < items.length; k++) {
    if (rest(k) + pinned + volumeIcon + moreW(k) <= avail) return { fold: k, compactVolume: true };
  }
  return { fold: items.length, compactVolume: true };
}
