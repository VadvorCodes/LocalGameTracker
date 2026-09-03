import { useEffect, useRef, useState } from "react";
import { applyTheme, CUSTOM_THEME_ID } from "../lib/themes";
import type { CustomThemeColours } from "../types";

interface Props {
  initial: CustomThemeColours;
  /** Fires once 400ms after the last change; the parent persists to store + backend. */
  onSettle: (colours: CustomThemeColours) => void;
  /** Blocks new edits while a theme save is in flight, so custom saves and
   * preset selections can never interleave. */
  disabled?: boolean;
}

/**
 * The two colour pickers for the custom theme. Drag-time work stays local:
 * state updates re-render only this component, and the live preview is a
 * requestAnimationFrame-coalesced CSS-variable write — no store updates or
 * IPC while dragging, which keeps the native colour popup responsive.
 */
export default function CustomThemeEditor({ initial, onSettle, disabled }: Props) {
  const [colours, setColours] = useState<CustomThemeColours>(initial);
  const coloursRef = useRef(colours);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  // Drop any pending frame/persist on unmount — a pending save must not fire
  // after the user has switched back to a preset.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  function update(patch: Partial<CustomThemeColours>) {
    const next = { ...coloursRef.current, ...patch };
    coloursRef.current = next;
    setColours(next);

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyTheme(CUSTOM_THEME_ID, next);
    });

    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onSettleRef.current(next);
    }, 400);
  }

  return (
    <div className={`mt-3 space-y-2 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 w-36 shrink-0">Background colour</span>
        <input
          type="color"
          value={colours.base}
          onChange={(e) => update({ base: e.target.value })}
          disabled={disabled}
          className="h-9 w-16 cursor-pointer rounded-lg border border-surface-600 bg-surface-800 p-1"
        />
        <span className="text-xs text-slate-400 font-mono">{colours.base}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 w-36 shrink-0">Accent colour</span>
        <input
          type="color"
          value={colours.accent}
          onChange={(e) => update({ accent: e.target.value })}
          disabled={disabled}
          className="h-9 w-16 cursor-pointer rounded-lg border border-surface-600 bg-surface-800 p-1"
        />
        <span className="text-xs text-slate-400 font-mono">{colours.accent}</span>
      </div>
      <p className="text-xs text-slate-500">
        The darker/lighter surface and accent shades are derived from these two colours and saved
        automatically.
      </p>
    </div>
  );
}
