import { useState } from "react";
import { StarIcon } from "./icons";

/** Read-only star display (supports half stars). */
export function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-slate-600">not rated</span>;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" title={`${value} / 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="relative inline-block w-4 h-4">
          <span className="absolute inset-0 text-surface-600">
            <StarIcon />
          </span>
          <span
            className="absolute inset-0 overflow-hidden"
            data-testid="star-fill"
            style={{ width: `${Math.max(0, Math.min(1, value - i)) * 100}%` }}
          >
            <StarIcon />
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Interactive half-step star picker rendered as FIVE stars. Each star is split
 * into left/right click zones (half vs full). Clicking the current value
 * clears the rating.
 */
export function StarPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  function pick(v: number) {
    onChange(value === v ? null : v);
  }
  return (
    <div
      className="flex items-center gap-1 select-none"
      role="group"
      aria-label="Star rating"
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, shown - (star - 1)));
        return (
          <div key={star} className="relative w-8 h-8">
            <button
              className="absolute left-0 top-0 w-1/2 h-full z-10"
              title={`${star - 0.5} stars`}
              aria-label={`${star - 0.5} stars`}
              onMouseEnter={() => setHover(star - 0.5)}
              onClick={() => pick(star - 0.5)}
            />
            <button
              className="absolute right-0 top-0 w-1/2 h-full z-10"
              title={`${star} stars`}
              aria-label={`${star} stars`}
              onMouseEnter={() => setHover(star)}
              onClick={() => pick(star)}
            />
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="relative inline-block w-5 h-5">
                <span className="absolute inset-0 text-surface-600">
                  <StarIcon className="w-5 h-5" />
                </span>
                {/* Clip container is exactly the glyph size, so a 50% width
                    clips the glyph at exactly its midpoint. */}
                <span
                  className="absolute inset-0 overflow-hidden"
                  data-testid="star-fill"
                  style={{ width: `${fill * 100}%` }}
                >
                  <StarIcon className="w-5 h-5" />
                </span>
              </span>
            </span>
          </div>
        );
      })}
      <span className="ml-2 text-sm text-slate-400">
        {value == null ? "No star rating" : `${value} / 5`}
      </span>
    </div>
  );
}
