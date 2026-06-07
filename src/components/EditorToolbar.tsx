import type { SaveStatus as SaveStatusValue } from "../types/domain";
import { SaveStatus } from "./SaveStatus";
import { WordCountBadge } from "./WordCountBadge";

type EditorToolbarProps = {
  chapterTitle?: string;
  isGeneratingSummary?: boolean;
  isLearningStyle?: boolean;
  isPolishing?: boolean;
  saveStatus: SaveStatusValue;
  wordCount: number;
  onFormatChapter?: () => void;
  onGenerateSummary?: () => void;
  onLearnStyle?: () => void;
  onPolish?: () => void;
  onStylePolish?: () => void;
};

export function EditorToolbar({
  chapterTitle,
  isGeneratingSummary = false,
  isLearningStyle = false,
  isPolishing = false,
  saveStatus,
  wordCount,
  onFormatChapter,
  onGenerateSummary,
  onLearnStyle,
  onPolish,
  onStylePolish
}: EditorToolbarProps) {
  return (
    <header className="editor-toolbar">
      <div>
        <p>当前章节</p>
        <h2>{chapterTitle ?? "未选择章节"}</h2>
      </div>
      <div className="editor-meta">
        {onFormatChapter && (
          <button className="ghost" onClick={onFormatChapter} type="button">
            一键排版
          </button>
        )}
        {onGenerateSummary && (
          <button className="ai-summary-button" disabled={isGeneratingSummary} onClick={onGenerateSummary} type="button">
            {isGeneratingSummary ? "生成中..." : "生成章节摘要"}
          </button>
        )}
        {onLearnStyle && (
          <button className="ghost" disabled={isLearningStyle} onClick={onLearnStyle} type="button">
            {isLearningStyle ? "学习中..." : "学习语言风格"}
          </button>
        )}
        {onPolish && (
          <button className="ai-summary-button" disabled={isPolishing} onClick={onPolish} type="button">
            {isPolishing ? "润色中..." : "AI 润色"}
          </button>
        )}
        {onStylePolish && (
          <button className="ai-summary-button" disabled={isPolishing} onClick={onStylePolish} type="button">
            风格化润色
          </button>
        )}
        <SaveStatus status={saveStatus} />
        <WordCountBadge count={wordCount} />
      </div>
    </header>
  );
}
