import { useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../store";

/** The sidebar's "Signed in locally as <name>" line; click the name to edit it
 * inline. Renames silently keep the old name on failure. */
export default function SidebarUsername() {
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  // Ref-based guard: handlers captured by onBlur survive into the commit that
  // unmounts the input, so a state check alone is not closure-proof.
  const busyRef = useRef(false);

  if (!profile) return null;

  function startEdit() {
    setValue(profile!.username);
    setEditing(true);
  }

  async function save() {
    if (busyRef.current) return;
    const next = value.trim();
    setEditing(false);
    if (!next || next === profile!.username) return;
    busyRef.current = true;
    setBusy(true);
    try {
      setProfile(await api.renameProfile(next));
    } catch {
      /* keep old name on failure */
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="mt-2 w-full px-3 py-1.5 text-xs bg-surface-800 border border-accent-500 rounded-lg text-slate-200 outline-none"
        maxLength={32}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="group/name mt-2 px-3 py-2 text-xs text-slate-500">
      Signed in locally as{" "}
      <button
        className="text-slate-300 font-medium underline-offset-2 group-hover/name:underline hover:text-white transition-colors"
        onClick={startEdit}
        title="Click to rename"
      >
        {profile.username}
      </button>
      <span className="opacity-0 group-hover/name:opacity-100 transition-opacity text-accent-400 ml-1">
        ✎
      </span>
    </div>
  );
}
