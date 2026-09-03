import { useState } from "react";
import CustomisationTab from "./settings/CustomisationTab";
import GeneralTab from "./settings/GeneralTab";

const TABS = [
  { id: "general", label: "General" },
  { id: "customisation", label: "Customisation" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** The modal shell: backdrop, Close button and tab switching. Each tab
 * component owns its own sections and mutations. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("general");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="card max-w-xl w-full p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button className="btn-ghost !px-3" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex gap-1 mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-accent-600/20 text-accent-400"
                  : "text-slate-400 hover:bg-surface-800 hover:text-slate-200"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "general" && <GeneralTab />}
        {tab === "customisation" && <CustomisationTab />}
      </div>
    </div>
  );
}
