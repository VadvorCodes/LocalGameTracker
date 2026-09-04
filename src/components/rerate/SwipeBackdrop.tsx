/**
 * Red / green swipe-direction backdrop. The label repeats vertically down the
 * full height of each side (so it reads at any window size) and sits behind
 * the tint, out of the card's travel path at the sides.
 */

/** Drag distance (px) at which a side's tint saturates — deliberately beyond
 * SwipeCard's COMMIT_THRESHOLD (110), so the tint peaks before a swipe can commit. */
const SATURATE_PX = 160;

export default function SwipeBackdrop({ dragX }: { dragX: number }) {
  const left = Math.min(1, Math.max(0, -dragX) / SATURATE_PX);
  const right = Math.min(1, Math.max(0, dragX) / SATURATE_PX);
  return (
    <div className="absolute inset-0 pointer-events-none flex overflow-hidden">
      <div
        className="flex-1 flex flex-col items-center justify-around py-4 bg-rose-600"
        style={{ opacity: left * 0.2 }}
      >
        {[0, 1, 2, 3].map((k) => (
          <span
            key={k}
            className="whitespace-nowrap text-4xl font-black tracking-widest text-rose-400"
            style={{ opacity: Math.min(1, left * 1.6), transform: "rotate(-8deg)" }}
          >
            RE-RATE
          </span>
        ))}
      </div>
      <div
        className="flex-1 flex flex-col items-center justify-around py-4 bg-emerald-600"
        style={{ opacity: right * 0.2 }}
      >
        {[0, 1, 2, 3].map((k) => (
          <span
            key={k}
            className="whitespace-nowrap text-4xl font-black tracking-widest text-emerald-400"
            style={{ opacity: Math.min(1, right * 1.6), transform: "rotate(8deg)" }}
          >
            KEEP RATING
          </span>
        ))}
      </div>
    </div>
  );
}
