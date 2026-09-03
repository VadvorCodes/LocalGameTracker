export function formatPlaytime(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date + (date.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function scoreColor(v: number): string {
  if (v >= 75) return "text-emerald-300";
  if (v >= 50) return "text-amber-300";
  return "text-rose-300";
}

/**
 * Join the defined parts with " · " into one meta line (developer · release
 * date · genres…). Null, undefined and empty parts are dropped.
 */
export function metaLine(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

/** One-line reading of how a star rating (0-5) compares to a 0-100 score. */
export function divergenceText(stars: number, overall: number): string {
  const diff = stars * 20 - overall;
  if (diff >= 15)
    return "Your star rating is well above your detailed score — a game you love more than its parts.";
  if (diff <= -15)
    return "Your detailed score is well above your star rating — impressive pieces that didn't quite win you over.";
  return "Your star rating and detailed score agree — a settled opinion.";
}
