import { useEffect, useState } from "react";
import type { CreateProjectInput, Project } from "../types/domain";
import { BookCard } from "./BookCard";
import { CreateBookModal } from "./CreateBookModal";

type ContextMenuState = {
  project: Project;
  x: number;
  y: number;
};

type BookShelfPageProps = {
  editingProject?: Project;
  isCreating: boolean;
  projects: Project[];
  onCloseCreateModal: () => void;
  onCreateBook: (input: CreateProjectInput) => Promise<void>;
  onDeleteBook: (project: Project) => Promise<void>;
  onEditBook: (project: Project) => void;
  onOpenBook: (projectId: string) => void;
  onOpenCreateModal: () => void;
  onUpdateBook: (project: Project, input: CreateProjectInput) => Promise<void>;
};

export function BookShelfPage({
  editingProject,
  isCreating,
  projects,
  onCloseCreateModal,
  onCreateBook,
  onDeleteBook,
  onEditBook,
  onOpenBook,
  onOpenCreateModal,
  onUpdateBook
}: BookShelfPageProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();

  useEffect(() => {
    const close = () => setContextMenu(undefined);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  return (
    <main className="bookshelf-page">
      <header className="bookshelf-toolbar">
        <div className="bookshelf-actions">
          <button onClick={onOpenCreateModal} type="button">
            创建书籍
          </button>
          <button
            className="muted-action"
            onClick={() => window.alert("导入功能后续实现")}
            title="导入书籍后续实现"
            type="button"
          >
            导入书籍
          </button>
        </div>
        <div className="bookshelf-title">
          <h1>梅瓮书架</h1>
          <p>选择一本书，继续今天的创作。</p>
        </div>
      </header>

      <section className="bookshelf-tabs">
        <span className="active">我的书架</span>
        <span>最近创作</span>
      </section>

      {projects.length > 0 ? (
        <section className="book-grid" aria-label="书籍列表">
          {projects.map((project) => (
            <BookCard
              key={project.id}
              project={project}
              onContextMenu={(target, position) => setContextMenu({ project: target, ...position })}
              onOpen={onOpenBook}
            />
          ))}
        </section>
      ) : (
        <section className="bookshelf-empty">
          <h2>还没有书籍</h2>
          <p>创建第一本书，卷和章节会在进入编辑器后继续管理。</p>
          <button onClick={onOpenCreateModal} type="button">
            创建书籍
          </button>
        </section>
      )}

      {contextMenu && (
        <div
          className="book-context-menu"
          onClick={(event) => event.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              onEditBook(contextMenu.project);
              setContextMenu(undefined);
            }}
            type="button"
          >
            修改书籍信息
          </button>
          <button
            className="danger"
            onClick={() => {
              void onDeleteBook(contextMenu.project);
              setContextMenu(undefined);
            }}
            type="button"
          >
            删除书籍
          </button>
        </div>
      )}

      {isCreating && !editingProject && <CreateBookModal onClose={onCloseCreateModal} onSubmit={onCreateBook} />}
      {editingProject && (
        <CreateBookModal
          project={editingProject}
          onClose={onCloseCreateModal}
          onSubmit={(input) => onUpdateBook(editingProject, input)}
        />
      )}
    </main>
  );
}
