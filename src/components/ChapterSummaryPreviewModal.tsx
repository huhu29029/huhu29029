import type { ChapterSummaryPayload } from "../ai/schemas";

type ChapterSummaryPreviewModalProps = {
  payload: ChapterSummaryPayload;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ChapterSummaryPreviewModal({ payload, onCancel, onConfirm }: ChapterSummaryPreviewModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="summary-preview-modal">
        <header>
          <h2>章节摘要预览</h2>
          <button onClick={onCancel} type="button">
            ×
          </button>
        </header>
        <section>
          <h3>章节摘要</h3>
          <p>{payload.chapter_summary}</p>
        </section>
        <SummaryList title="世界观变化" items={payload.world_updates} />
        <SummaryList title="人物变化" items={payload.character_updates} />
        <SummaryList title="主线推进" items={payload.main_plot_updates} />
        <SummaryList title="伏笔" items={payload.foreshadowing} />
        <footer>
          <button className="ghost" onClick={onCancel} type="button">
            取消
          </button>
          <button onClick={onConfirm} type="button">
            确认写入数据库
          </button>
        </footer>
      </div>
    </div>
  );
}

function SummaryList({ items, title }: { items: string[]; title: string }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>无</p>
      )}
    </section>
  );
}
