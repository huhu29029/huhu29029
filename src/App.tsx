import { useMemo, useState } from "react";
import { demoChapters, demoCharacters, demoPlotThreads, demoProject } from "./data/mockData";

function App() {
  const [selectedChapterId, setSelectedChapterId] = useState(demoChapters[0]?.id);

  const selectedChapter = useMemo(
    () => demoChapters.find((chapter) => chapter.id === selectedChapterId) ?? demoChapters[0],
    [selectedChapterId]
  );

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="项目和章节导航">
        <div className="brand">
          <span className="brand-mark">NM</span>
          <div>
            <h1>Novel Memory Engine</h1>
            <p>本地长篇小说记忆库</p>
          </div>
        </div>

        <section className="nav-section">
          <h2>项目</h2>
          <button className="project-button active" type="button">
            <strong>{demoProject.title}</strong>
            <span>{demoProject.description}</span>
          </button>
        </section>

        <section className="nav-section">
          <h2>章节</h2>
          <div className="chapter-list">
            {demoChapters.map((chapter) => (
              <button
                className={chapter.id === selectedChapter?.id ? "chapter-button active" : "chapter-button"}
                key={chapter.id}
                onClick={() => setSelectedChapterId(chapter.id)}
                type="button"
              >
                <span>{String(chapter.chapterIndex).padStart(2, "0")}</span>
                <strong>{chapter.title}</strong>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="chapter-pane" aria-label="章节内容">
        <header className="chapter-header">
          <div>
            <p>当前章节</p>
            <h2>{selectedChapter.title}</h2>
          </div>
          <span>{selectedChapter.wordCount} 字</span>
        </header>

        <article className="chapter-content">
          <p>{selectedChapter.content}</p>
        </article>
      </section>

      <aside className="inspector" aria-label="大纲、摘要和角色状态">
        <section className="panel">
          <h2>章节摘要</h2>
          <p>摘要功能已预留，后续可由 AI 或人工生成并写入 chapter_summaries。</p>
        </section>

        <section className="panel">
          <h2>总大纲</h2>
          <p>这里将展示当前项目的全局大纲、剧情阶段和偏移提示。</p>
        </section>

        <section className="panel">
          <h2>角色状态</h2>
          <div className="character-list">
            {demoCharacters.map((character) => (
              <div className="character-row" key={character.id}>
                <strong>{character.name}</strong>
                <span>{character.role ?? "未分类"} · {character.currentState}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>剧情线</h2>
          {demoPlotThreads.map((thread) => (
            <div className="thread-row" key={thread.id}>
              <strong>{thread.title}</strong>
              <span>{thread.status}</span>
            </div>
          ))}
        </section>
      </aside>
    </main>
  );
}

export default App;
