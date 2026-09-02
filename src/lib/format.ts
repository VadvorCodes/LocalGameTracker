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
