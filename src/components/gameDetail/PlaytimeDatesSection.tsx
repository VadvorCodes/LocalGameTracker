import { useState } from "react";
import type { LibraryEntry } from "../../types";
import type { api } from "../../api";
import { formatPlaytime } from "../../lib/format";

/** Patch accepted by the page's `updateLibraryEntry` wrapper. */
export type EntryPatch = Parameters<typeof api.updateLibraryEntry>[1];

// Preset thresholds stored as exact values ("100+" saves 100 h) so sorting and
// any future filtering keep working on plain minutes. Anything else is Custom.
const HOUR_PRESETS = [5, 10, 25, 50, 100, 250, 500, 1000];
const HOURS_CUSTOM = "custom";

/** Which dropdown option a given hours value corresponds to. */
function hoursPresetFor(hoursStr: string): string {
  const h = Math.max(0, Math.floor(Number(hoursStr) || 0));
  if (h === 0) return "0";
  return (HOUR_PRESETS as readonly number[]).includes(h) ? String(h) : HOURS_CUSTOM;
}

/**
 * Hours-played and started/finished date fields.
 *
 * Hours use a string protocol: the dropdown offers exact preset values
 * ("100+" saves 100 h) plus a Custom escape hatch that reveals a number
 * input; a custom value is committed on blur and snaps back to its preset
 * when it matches one exactly.
 *
 * Dates are drafted locally and committed on blur: committing on every
 * keystroke let the backend round-trip clobber half-typed values.
 *
 * Rendered as a fragment (fields, then the date error and tracked-playtime
 * lines) so it slots straight into the page's `space-y-6` column. The parent
 * keys it by entry id so drafts reset when another entry is loaded.
 */
export default function PlaytimeDatesSection({
  entry,
  onPatch,
}: {
  entry: LibraryEntry;
  onPatch: (patch: EntryPatch) => Promise<boolean>;
}) {
  const [hours, setHours] = useState(() => String(Math.floor(entry.playtimeMinutes / 60)));
  const [hoursPreset, setHoursPreset] = useState(() =>
    hoursPresetFor(String(Math.floor(entry.playtimeMinutes / 60))),
  );
  const [startedDraft, setStartedDraft] = useState(entry.startedAt?.slice(0, 10) ?? "");
  const [finishedDraft, setFinishedDraft] = useState(entry.finishedAt?.slice(0, 10) ?? "");
  const [dateError, setDateError] = useState<string | null>(null);

  async function savePlaytime() {
    const h = Math.max(0, Math.floor(Number(hours) || 0));
    // An exact preset value typed into the custom field snaps back to the preset.
    setHoursPreset(hoursPresetFor(String(h)));
    await onPatch({ playtimeMinutes: h * 60 });
  }

  function selectHoursPreset(v: string) {
    setHoursPreset(v);
    if (v === HOURS_CUSTOM) return; // number input takes over; saved on blur
    setHours(v);
    onPatch({ playtimeMinutes: Number(v) * 60 });
  }

  // ISO dates compare correctly as strings. Validate the merged pair on
  // whichever field was just edited; the backend re-checks authoritatively.
  function commitDate(which: "started" | "finished") {
    const s = startedDraft;
    const f = finishedDraft;
    if (s && f && s > f) {
      setDateError("Started date cannot be after the Finished date.");
      return;
    }
    setDateError(null);
    if (which === "started") {
      if (s !== (entry.startedAt?.slice(0, 10) ?? "")) onPatch({ startedAt: s });
    } else {
      if (f !== (entry.finishedAt?.slice(0, 10) ?? "")) onPatch({ finishedAt: f });
    }
  }

  return (
    <>
      <section className="grid grid-cols-3 gap-4">
        <label className="text-xs text-slate-400">
          <div className="mb-1 font-semibold uppercase tracking-wide">Hours played</div>
          <select
            className="input w-full"
            value={hoursPreset}
            onChange={(e) => selectHoursPreset(e.target.value)}
          >
            <option value="0">Not tracked</option>
            {HOUR_PRESETS.map((h) => (
              <option key={h} value={String(h)}>
                {h}+ hours
              </option>
            ))}
            <option value={HOURS_CUSTOM}>Custom…</option>
          </select>
          {hoursPreset === HOURS_CUSTOM && (
            <input
              className="input w-full mt-2"
              type="number"
              min={0}
              step={1}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onBlur={savePlaytime}
              autoFocus
            />
          )}
        </label>
        <label className="text-xs text-slate-400">
          <div className="mb-1 font-semibold uppercase tracking-wide">Started</div>
          <input
            className="input w-full"
            type="date"
            value={startedDraft}
            onChange={(e) => setStartedDraft(e.target.value)}
            onBlur={() => commitDate("started")}
          />
        </label>
        <label className="text-xs text-slate-400">
          <div className="mb-1 font-semibold uppercase tracking-wide">Finished</div>
          <input
            className="input w-full"
            type="date"
            value={finishedDraft}
            onChange={(e) => setFinishedDraft(e.target.value)}
            onBlur={() => commitDate("finished")}
          />
        </label>
      </section>
      {dateError && <p className="text-xs text-rose-400 -mt-3">{dateError}</p>}
      {entry.playtimeMinutes > 0 && (
        <p className="text-xs text-slate-500 -mt-3">
          Tracked: {formatPlaytime(entry.playtimeMinutes)}
        </p>
      )}
    </>
  );
}
