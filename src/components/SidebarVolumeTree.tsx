import { useEffect, useRef } from "react";
import type { Chapter, Project, Volume } from "../types/domain";

type Workspace = "editor" | "outline" | "memory" | "corpusStyle" | "aiSettings";

type SidebarVolumeTreeProps = {
  activeWorkspace: Workspace;
  chapters: Chapter[];
  editingId?: string;
  editingTitle: string;
  isSelectionMode: boolean;
  project: Project;
  expandedVolumeIds: Set<string>;
  selectedChapterIds: Set<string>;
  selectedChapterId?: string;
  selectedCount: number;
  selectedVolumeId?: string;
  selectedVolumeIds: Set<string>;
  volumes: Volume[];
  onBackToShelf: () => void;
  onCreateChapter: () => void;
  onCreateVolume: () => void;
  onDeleteSelected: () => void;
  onEditTitleChange: (title: string) => void;
  onExport: () => void;
  onImport: () => void;
  onOpenAISettings: () => void;
  onOpenCorpusStyle: () => void;
  onOpenEditor: () => void;
  onOpenMemory: () => void;
  onOpenOutline: () => void;
  onRenameCommit: () => void;
  onSelectChapter: (chapterId: string) => void;
  onSelectVolume: (volumeId: string) => void;
  onStartRename: (target: { id: string; title: string; type: "volume" | "chapter" }) => void;
  onToggleChapterSelection: (chapterId: string) => void;
  onToggleVolumeExpanded: (volumeId: string) => void;
  onToggleSelectionMode: () => void;
  onToggleVolumeSelection: (volumeId: string) => void;
};

export function SidebarVolumeTree({
  activeWorkspace,
  chapters,
  editingId,
  editingTitle,
  isSelectionMode,
  project,
  expandedVolumeIds,
  selectedChapterIds,
  selectedChapterId,
  selectedCount,
  selectedVolumeId,
  selectedVolumeIds,
  volumes,
  onBackToShelf,
  onCreateChapter,
  onCreateVolume,
  onDeleteSelected,
  onEditTitleChange,
  onExport,
  onImport,
  onOpenAISettings,
  onOpenCorpusStyle,
  onOpenEditor,
  onOpenMemory,
  onOpenOutline,
  onRenameCommit,
  onSelectChapter,
  onSelectVolume,
  onStartRename,
  onToggleChapterSelection,
  onToggleVolumeExpanded,
  onToggleSelectionMode,
  onToggleVolumeSelection
}: SidebarVolumeTreeProps) {
  return (
    <aside className="sidebar" aria-label="项目、卷和章节导航">
      <div className="brand">
        <span className="brand-mark">NM</span>
        <div>
          <h1>Novel Memory Engine</h1>
          <p>本地小说正文编辑</p>
        </div>
      </div>

      <button className="back-shelf-button" onClick={onBackToShelf} type="button">
        返回书架
      </button>

      <section className="nav-section">
        <div className="section-heading">
          <h2>项目</h2>
        </div>
        <button className="project-button active" type="button">
          <strong>{project.title}</strong>
          <span>{project.description}</span>
        </button>
      </section>

      <section className="nav-section">
        <div className="section-heading">
          <h2>功能</h2>
        </div>
        <div className="project-tools">
          <button className={activeWorkspace === "editor" ? "active" : ""} onClick={onOpenEditor} type="button">
            正文编辑
          </button>
          <button className={activeWorkspace === "outline" ? "active" : ""} onClick={onOpenOutline} type="button">
            小说大纲
          </button>
          <button className={activeWorkspace === "memory" ? "active" : ""} onClick={onOpenMemory} type="button">
            记忆库管理
          </button>
          <button className={activeWorkspace === "corpusStyle" ? "active" : ""} onClick={onOpenCorpusStyle} type="button">
            文风指纹库
          </button>
          <button className={activeWorkspace === "aiSettings" ? "active" : ""} onClick={onOpenAISettings} type="button">
            AI 设置
          </button>
        </div>
      </section>

      {activeWorkspace === "editor" && (
        <section className="nav-section grow">
          <div className="section-heading tree-heading">
            <div>
              <h2>卷与章节</h2>
              {isSelectionMode && <span className="selection-count">已选择 {selectedCount} 项</span>}
            </div>
            <div className="sidebar-actions">
              <button onClick={onCreateVolume} title="新建卷" type="button">
                新建卷
              </button>
              <button onClick={onCreateChapter} title="新建章节" type="button">
                新建章节
              </button>
              <button onClick={onImport} title="导入章节" type="button">
                导入
              </button>
              <button onClick={onExport} title="导出章节" type="button">
                导出
              </button>
              <button
                className={isSelectionMode ? "active" : ""}
                onClick={onToggleSelectionMode}
                title="选择/批量操作"
                type="button"
              >
                选择
              </button>
              <button disabled={selectedCount === 0} onClick={onDeleteSelected} title="删除选中内容" type="button">
                删除
              </button>
            </div>
          </div>

          <div className="volume-tree">
            {volumes.map((volume) => {
              const volumeChapters = chapters.filter((chapter) => chapter.volumeId === volume.id);
              const selectedInVolume = volumeChapters.filter((chapter) => selectedChapterIds.has(chapter.id));
              const isSelectedVolume = selectedVolumeId === volume.id;
              const isExpandedVolume = expandedVolumeIds.has(volume.id);
              const isCheckedVolume =
                selectedVolumeIds.has(volume.id) ||
                (volumeChapters.length > 0 && selectedInVolume.length === volumeChapters.length);
              const isPartialVolume =
                !selectedVolumeIds.has(volume.id) &&
                selectedInVolume.length > 0 &&
                selectedInVolume.length < volumeChapters.length;

              return (
                <div className="volume-node" key={volume.id}>
                  <div
                    className={
                      isSelectedVolume || isCheckedVolume || isPartialVolume
                        ? "tree-row volume-row active"
                        : "tree-row volume-row"
                    }
                  >
                    {isSelectionMode && (
                      <TreeCheckbox
                        checked={isCheckedVolume}
                        indeterminate={isPartialVolume}
                        label={`选择${volume.title}`}
                        onChange={() => onToggleVolumeSelection(volume.id)}
                      />
                    )}
                    <button
                      className="tree-title-button"
                      onClick={() => {
                        onSelectVolume(volume.id);
                        onToggleVolumeExpanded(volume.id);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        onStartRename({ id: volume.id, title: volume.title, type: "volume" });
                      }}
                      type="button"
                    >
                      <span className="tree-caret">{isExpandedVolume ? "▼" : "▶"}</span>
                      {editingId === volume.id ? (
                        <RenameInput value={editingTitle} onChange={onEditTitleChange} onCommit={onRenameCommit} />
                      ) : (
                        <strong>{volume.title}</strong>
                      )}
                    </button>
                  </div>

                  {isExpandedVolume && (
                    <div className="chapter-list">
                      {volumeChapters.map((chapter, index) => (
                        <div
                          className={
                            chapter.id === selectedChapterId || selectedChapterIds.has(chapter.id)
                              ? "tree-row chapter-row active"
                              : "tree-row chapter-row"
                          }
                          key={chapter.id}
                        >
                          {isSelectionMode && (
                            <TreeCheckbox
                              checked={selectedChapterIds.has(chapter.id)}
                              label={`选择${chapter.title}`}
                              onChange={() => onToggleChapterSelection(chapter.id)}
                            />
                          )}
                          <button
                            className="tree-title-button"
                            onClick={() => onSelectChapter(chapter.id)}
                            onDoubleClick={() =>
                              onStartRename({ id: chapter.id, title: chapter.title, type: "chapter" })
                            }
                            type="button"
                          >
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            {editingId === chapter.id ? (
                              <RenameInput value={editingTitle} onChange={onEditTitleChange} onCommit={onRenameCommit} />
                            ) : (
                              <strong>{chapter.title}</strong>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </aside>
  );
}

type TreeCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
};

function TreeCheckbox({ checked, indeterminate = false, label, onChange }: TreeCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      aria-label={label}
      checked={checked}
      className="tree-checkbox"
      onChange={onChange}
      type="checkbox"
    />
  );
}

type RenameInputProps = {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
};

function RenameInput({ value, onChange, onCommit }: RenameInputProps) {
  return (
    <input
      autoFocus
      className="rename-input"
      onBlur={onCommit}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit();
        }
      }}
      value={value}
    />
  );
}
