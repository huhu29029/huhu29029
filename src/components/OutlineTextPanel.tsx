import type { OutlineSectionType } from "../types/domain";
import { countWords } from "../utils/text";
import { OutlineTabs, outlineTabs } from "./OutlineTabs";

type OutlineTextPanelProps = {
  activeSection: OutlineSectionType;
  content: string;
  saveState: string;
  onChange: (content: string) => void;
  onClear: () => void;
  onRefine: () => void;
  onSave: () => void;
  onSortByChapter: () => void;
  onTabChange: (sectionType: OutlineSectionType) => void;
};

export function OutlineTextPanel({
  activeSection,
  content,
  saveState,
  onChange,
  onClear,
  onRefine,
  onSave,
  onSortByChapter,
  onTabChange
}: OutlineTextPanelProps) {
  const activeLabel = outlineTabs.find((tab) => tab.value === activeSection)?.label ?? "大纲";
  const canSortByChapter = activeSection === "main_plot" || activeSection === "branch_plot";

  return (
    <section className="outline-panel">
      <header className="outline-panel-header">
        <strong>文字大纲区</strong>
        <div>
          <button className="ghost" onClick={onRefine} title="输入关键词，让 AI 针对当前栏目补充遗漏信息" type="button">
            定向补全
          </button>
          {canSortByChapter && (
            <button className="ghost" onClick={onSortByChapter} title="按章节范围整理当前栏目顺序" type="button">
              按章节整理
            </button>
          )}
          <button className="ghost" onClick={onClear} type="button">
            清空
          </button>
          <button onClick={onSave} type="button">
            保存
          </button>
        </div>
      </header>
      <OutlineTabs active={activeSection} onChange={onTabChange} />
      <div className="outline-text-body">
        <div className="outline-meta-grid">
          <div>
            <span>当前分页</span>
            <strong>{activeLabel}</strong>
          </div>
          <div>
            <span>字数</span>
            <strong>{countWords(content)}</strong>
          </div>
          <div>
            <span>状态</span>
            <strong>{saveState}</strong>
          </div>
        </div>
        <textarea
          className="outline-textarea"
          onChange={(event) => onChange(event.target.value)}
          placeholder="在这里整理当前分页的大纲内容..."
          value={content}
        />
      </div>
    </section>
  );
}
