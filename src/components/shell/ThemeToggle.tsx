import { Icon, type IconName } from "../ui/Icon";
import type { ThemePreference } from "../../theme/useTheme";

const OPTIONS: Array<{ id: ThemePreference; label: string; icon: IconName }> = [
  { id: "system", label: "System", icon: "system" },
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
];

/** Three-way theme control. Radio semantics: one selected value, arrow keys move between options. */
export function ThemeToggle({ preference, onChange }: { preference: ThemePreference; onChange: (value: ThemePreference) => void }) {
  return (
    <div aria-label="Colour theme" className="theme-toggle" role="radiogroup">
      {OPTIONS.map((option, index) => (
        <button
          aria-checked={preference === option.id}
          aria-label={`${option.label} theme`}
          className="theme-toggle-option"
          data-theme-option={option.id}
          key={option.id}
          onClick={() => onChange(option.id)}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const group = event.currentTarget.parentElement;
            const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length];
            onChange(next.id);
            requestAnimationFrame(() => group?.querySelector<HTMLElement>(`[data-theme-option="${next.id}"]`)?.focus());
          }}
          role="radio"
          tabIndex={preference === option.id ? 0 : -1}
          title={`${option.label} theme`}
          type="button"
        >
          <Icon name={option.icon} size={16} />
        </button>
      ))}
    </div>
  );
}
