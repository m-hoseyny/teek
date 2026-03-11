import type { SettingsSection } from "../settings-section-types";

interface SidebarSection {
  id: SettingsSection;
  label: string;
  description: string;
}

interface SettingsSidebarProps {
  sections: SidebarSection[];
  activeSection: SettingsSection;
  isSaving: boolean;
  onSectionSelect: (section: SettingsSection) => void;
}

export function SettingsSidebar({ sections, activeSection, isSaving, onSectionSelect }: SettingsSidebarProps) {
  return (
    <aside className="hidden md:block">
      <div className="sticky top-6 space-y-1 rounded-xl border border-border glass p-3">
        {sections.map((section) => {
          const isActive = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              disabled={isSaving}
              onClick={() => onSectionSelect(section.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-all disabled:opacity-60 ${
                isActive
                  ? "border-primary bg-primary text-white glow-purple"
                  : "border-transparent text-gray-400 hover:text-white hover:bg-card"
              }`}
            >
              <p className="text-sm font-semibold">{section.label}</p>
              <p className={`text-xs ${isActive ? "text-blue-200" : "text-gray-500"}`}>{section.description}</p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
