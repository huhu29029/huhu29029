import type { OutlineSectionType } from "../types/domain";

export const outlineTabs: Array<{ label: string; value: OutlineSectionType }> = [
  { label: "世界观", value: "world" },
  { label: "主角团", value: "main_characters" },
  { label: "配角", value: "roles" },
  { label: "主线剧情", value: "main_plot" },
  { label: "支线剧情", value: "branch_plot" },
  { label: "矛盾冲突", value: "conflicts" }
];

type OutlineTabsProps = {
  active: OutlineSectionType;
  onChange: (sectionType: OutlineSectionType) => void;
};

export function OutlineTabs({ active, onChange }: OutlineTabsProps) {
  return (
    <div className="outline-tabs">
      {outlineTabs.map((tab) => (
        <button
          className={active === tab.value ? "active" : ""}
          key={tab.value}
          onClick={() => onChange(tab.value)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
