import { useState } from "react";
import { api } from "../api";
import { useApp } from "../store";

export default function Onboarding() {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setProfile = useApp((s) => s.setProfile);

  async function submit() {
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.createProfile(username);
      setProfile(p);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-surface-950">
      <div className="card p-10 w-[420px] text-center">
        <div className="text-5xl mb-4">🎮</div>
        <h1 className="text-2xl font-bold text-white mb-2">Welcome to GameTracker</h1>
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          Your private, offline-first game library. No account, no cloud — everything stays on
          this machine.
        </p>
        <input
          className="input w-full text-center"
          placeholder="Choose a local username"
          value={username}
          maxLength={32}
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
        <button
          className="btn-primary w-full mt-4"
          disabled={busy || !username.trim()}
          onClick={submit}
        >
          {busy ? "Creating…" : "Start tracking"}
        </button>
      </div>
    </div>
  );
}
