/**
 * Interstitial between "Start cycle" and the first card, while the backend
 * assembles the pool.
 */
export default function LoadingScreen() {
  return (
    <div className="h-full flex items-center justify-center text-slate-500">
      Shuffling your library…
    </div>
  );
}
