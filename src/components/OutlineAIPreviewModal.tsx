import type { GenerateOutlineParsedPayload } from "../ai/schemas";

type OutlineAIPreviewModalProps = {
  result: GenerateOutlineParsedPayload & {
    batchMeta?: {
      totalBatches: number;
      parsedChapterCount: number;
      batches: Array<{
        index: number;
        range: string;
        status: "success" | "failed";
        chapterTitles: string[];
        error?: string;
      }>;
    };
  };
  onCancel: () => void;
  onSaveTextOnly: () => void;
  onSaveWithMindMap: () => void;
};

export function OutlineAIPreviewModal({
  result,
  onCancel,
  onSaveTextOnly,
  onSaveWithMindMap
}: OutlineAIPreviewModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="outline-ai-preview-modal">
        <header>
          <h2>AI 大纲结果预览</h2>
          <button aria-label="关闭" onClick={onCancel} type="button">
            x
          </button>
        </header>

        {result.batchMeta && (
          <section className="outline-ai-batch-summary">
            <h3>批量解析</h3>
            <p>
              共 {result.batchMeta.totalBatches} 批，已解析 {result.batchMeta.parsedChapterCount} 章
            </p>
          </section>
        )}

        {result.mindmapSkipped && <section className="outline-ai-warning">思维导图建议格式异常，已跳过导图生成。</section>}

        <div className="outline-ai-preview-grid">
          <PreviewBlock title="世界观">{result.outline_text_updates.world || "无内容"}</PreviewBlock>
          <PreviewBlock title="主角团">{result.outline_text_updates.main_characters || "无内容"}</PreviewBlock>
          <PreviewBlock title="配角">{result.outline_text_updates.roles || "无内容"}</PreviewBlock>
          <PreviewBlock title="主线剧情">{result.outline_text_updates.main_plot || "无内容"}</PreviewBlock>
          <PreviewBlock title="支线剧情">{result.outline_text_updates.branch_plot || "无内容"}</PreviewBlock>
          <PreviewBlock title="矛盾冲突">{result.outline_text_updates.conflicts || "无内容"}</PreviewBlock>
        </div>

        <footer>
          <button className="ghost" onClick={onCancel} type="button">
            取消
          </button>
          <button onClick={onSaveTextOnly} type="button">
            仅保存文字大纲
          </button>
          <button onClick={onSaveWithMindMap} type="button">
            保存文字大纲 + 生成导图节点
          </button>
        </footer>
      </div>
    </div>
  );
}

function PreviewBlock({ children, title }: { children: string; title: string }) {
  return (
    <section>
      <h3>{title}</h3>
      <pre>{children}</pre>
    </section>
  );
}
