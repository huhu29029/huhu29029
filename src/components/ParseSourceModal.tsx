import { useMemo, useState } from "react";
import type { Chapter, Volume } from "../types/domain";

export type ParseMode = "all" | "volume" | "chapter";
export type AnalysisMode = "simple" | "detailed";

export type ParseStartPayload = {
  analysisMode: AnalysisMode;
  mode: ParseMode;
  chapterIds: string[];
};

type ParseSourceModalProps = {
  chapters: Chapter[];
  volumes: Volume[];
  onClose: () => void;
  onStart: (payload: ParseStartPayload) => void;
};

const BATCH_SIZE = 10;

export function ParseSourceModal({ chapters, volumes, onClose, onStart }: ParseSourceModalProps) {
  const [mode, setMode] = useState<ParseMode>("all");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("simple");
  const [selectedVolumeIds, setSelectedVolumeIds] = useState<Set<string>>(() => new Set());
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(() => new Set());

  const sortedVolumes = useMemo(
    () => [...volumes].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    [volumes]
  );

  const volumeOrder = useMemo(() => new Map(sortedVolumes.map((volume, index) => [volume.id, index])), [sortedVolumes]);
  const sortedChapters = useMemo(() => sortChaptersByVolume(chapters, volumeOrder), [chapters, volumeOrder]);

  const selectedChapters = useMemo(() => {
    if (mode === "all") return sortedChapters;
    if (mode === "volume") return sortedChapters.filter((chapter) => selectedVolumeIds.has(chapter.volumeId));
    return sortedChapters.filter((chapter) => selectedChapterIds.has(chapter.id));
  }, [mode, selectedChapterIds, selectedVolumeIds, sortedChapters]);

  const selectedChapterIdsForStart = selectedChapters.map((chapter) => chapter.id);
  const chunkSize = analysisMode === "simple" ? 5 : 3;
  const batchCount = Math.ceil(selectedChapters.length / chunkSize);
  const estimatedCalls = analysisMode === "simple" ? batchCount + Math.ceil(batchCount / 4) + 1 : batchCount * 4 + Math.ceil(batchCount / 4) + 1;

  const startParse = () => {
    if (selectedChapters.length === 0) {
      window.alert("没有可解析的章节");
      return;
    }
    console.log("[AI Outline Parse] modal selection", {
      mode,
      analysisMode,
      selectedChapterIds: selectedChapterIdsForStart,
      chapterTitles: selectedChapters.map((chapter) => chapter.title)
    });
    onStart({ mode, analysisMode, chapterIds: selectedChapterIdsForStart });
  };

  return (
    <div className="modal-backdrop">
      <div className="parse-modal">
        <header>
          <h2>解析正文</h2>
          <button aria-label="关闭" onClick={onClose} type="button">
            x
          </button>
        </header>

        <p className="parse-limit-note">系统会按每 {BATCH_SIZE} 章一批连续解析，并在每批之间保留已提取的大纲信息。</p>

        <div className="parse-mode-box">
          <strong>解析模式</strong>
          <div className="parse-options">
            <ParseOption
              active={analysisMode === "simple"}
              description="速度较快，适合快速生成主线、世界观和主要人物大纲。"
              label="简单解析"
              onClick={() => setAnalysisMode("simple")}
            />
            <ParseOption
              active={analysisMode === "detailed"}
              description="速度较慢，适合深入提取角色、支线、矛盾、伏笔和思维导图建议。"
              label="详细解析"
              onClick={() => setAnalysisMode("detailed")}
            />
          </div>
          {analysisMode === "detailed" && <p className="parse-limit-note">详细解析会进行更多 AI 调用，速度较慢，token 消耗更高。</p>}
        </div>

        <div className="parse-options">
          <ParseOption
            active={mode === "all"}
            description="收集当前项目全部章节，按卷和章节顺序解析。"
            label="从全文开始解析"
            onClick={() => setMode("all")}
          />
          <ParseOption
            active={mode === "volume"}
            description="选择一个或多个分卷作为解析范围。"
            label="选择分卷解析"
            onClick={() => setMode("volume")}
          />
          <ParseOption
            active={mode === "chapter"}
            description="选择任意章节作为解析范围。"
            label="选择章节解析"
            onClick={() => setMode("chapter")}
          />
        </div>

        {mode === "volume" && (
          <div className="parse-range-box">
            {sortedVolumes.length === 0 ? (
              <p>当前项目还没有分卷。</p>
            ) : (
              sortedVolumes.map((volume) => (
                <label key={volume.id}>
                  <input
                    checked={selectedVolumeIds.has(volume.id)}
                    onChange={() => setSelectedVolumeIds((current) => toggleSetValue(current, volume.id))}
                    type="checkbox"
                  />
                  <span>{volume.title}</span>
                  <small>{sortedChapters.filter((chapter) => chapter.volumeId === volume.id).length} 章</small>
                </label>
              ))
            )}
          </div>
        )}

        {mode === "chapter" && (
          <div className="parse-range-box">
            {groupChapters(sortedChapters, sortedVolumes).map((group) => (
              <div className="parse-range-group" key={group.id}>
                <strong>{group.title}</strong>
                {group.chapters.map((chapter) => (
                  <label key={chapter.id}>
                    <input
                      checked={selectedChapterIds.has(chapter.id)}
                      onChange={() => setSelectedChapterIds((current) => toggleSetValue(current, chapter.id))}
                      type="checkbox"
                    />
                    <span>{chapter.title}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="parse-range-box parse-preview-box">
          <strong>即将解析</strong>
          {selectedChapters.length === 0 ? (
            <p>没有可解析的章节</p>
          ) : (
            <ol className="parse-preview-list">
              {selectedChapters.slice(0, 30).map((chapter) => (
                <li key={chapter.id}>{chapter.title}</li>
              ))}
            </ol>
          )}
        </div>

        <div className="parse-count">
          已选择 {selectedChapters.length} 章，将拆分为 {batchCount} 个 chunk。缓存命中数量将在开始解析后检查。预计 AI 调用约 {estimatedCalls} 次，当前并发数 2。
        </div>

        <footer>
          <span>解析完成后会生成大纲提取结果，调试日志仍会保存在本地 logs 目录。</span>
          <div>
            <button className="ghost" onClick={onClose} type="button">
              取消
            </button>
            <button disabled={selectedChapters.length === 0} onClick={startParse} type="button">
              开始解析
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function sortChaptersByVolume(chapters: Chapter[], volumeOrder: Map<string, number>) {
  return [...chapters].sort((a, b) => {
    const volumeA = volumeOrder.get(a.volumeId) ?? Number.MAX_SAFE_INTEGER;
    const volumeB = volumeOrder.get(b.volumeId) ?? Number.MAX_SAFE_INTEGER;
    return volumeA - volumeB || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
  });
}

function groupChapters(chapters: Chapter[], volumes: Volume[]) {
  const groups = volumes
    .map((volume) => ({
      id: volume.id,
      title: volume.title,
      chapters: chapters.filter((chapter) => chapter.volumeId === volume.id)
    }))
    .filter((group) => group.chapters.length > 0);
  const volumeIds = new Set(volumes.map((volume) => volume.id));
  const ungrouped = chapters.filter((chapter) => !volumeIds.has(chapter.volumeId));
  if (ungrouped.length > 0) {
    groups.push({ id: "__ungrouped__", title: "未分卷", chapters: ungrouped });
  }
  return groups;
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function ParseOption({
  active,
  description,
  label,
  onClick
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} type="button">
      <strong>{label}</strong>
      <span>{description}</span>
    </button>
  );
}
