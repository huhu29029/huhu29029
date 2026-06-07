import { useEffect, useState } from "react";
import { BookShelfPage } from "./components/BookShelfPage";
import { EditorLayout } from "./components/EditorLayout";
import { createProject, deleteProject, listProjects, updateProject } from "./tauriApi";
import type { CreateProjectInput, Project } from "./types/domain";

type View = "bookshelf" | "editor";

function App() {
  const [currentView, setCurrentView] = useState<View>("bookshelf");
  const [currentProjectId, setCurrentProjectId] = useState<string>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<Project>();
  const [loadError, setLoadError] = useState<string>();

  const refreshProjects = async () => {
    const nextProjects = await listProjects();
    setProjects(nextProjects);
    setLoadError(undefined);
    return nextProjects;
  };

  useEffect(() => {
    refreshProjects().catch((error) => {
      console.error(error);
      setLoadError(String(error));
    });
  }, []);

  const handleCreateBook = async (input: CreateProjectInput) => {
    const created = await createProject(input);
    setProjects((current) => [created, ...current.filter((project) => project.id !== created.id)]);
    setIsCreating(false);
    setEditingProject(undefined);
    refreshProjects().catch((error) => {
      console.error(error);
      setLoadError(String(error));
    });
  };

  const handleUpdateBook = async (project: Project, input: CreateProjectInput) => {
    const updated = await updateProject(project.id, input);
    setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEditingProject(undefined);
    refreshProjects().catch((error) => {
      console.error(error);
      setLoadError(String(error));
    });
  };

  const handleDeleteBook = async (project: Project) => {
    if (!window.confirm(`确定删除《${project.title}》吗？该书籍下的卷和章节也会被删除，此操作不可恢复。`)) {
      return;
    }

    await deleteProject(project.id);
    setProjects((current) => current.filter((item) => item.id !== project.id));
    refreshProjects().catch((error) => {
      console.error(error);
      setLoadError(String(error));
    });
  };

  const handleBackToShelf = () => {
    setCurrentView("bookshelf");
    setCurrentProjectId(undefined);
    refreshProjects().catch((error) => {
      console.error(error);
      setLoadError(String(error));
    });
  };

  if (loadError && projects.length === 0) {
    return (
      <main className="empty-state">
        <h1>书架加载失败</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (currentView === "editor" && currentProjectId) {
    return <EditorLayout projectId={currentProjectId} onBackToShelf={handleBackToShelf} />;
  }

  return (
    <BookShelfPage
      editingProject={editingProject}
      isCreating={isCreating}
      projects={projects}
      onCloseCreateModal={() => {
        setIsCreating(false);
        setEditingProject(undefined);
      }}
      onCreateBook={handleCreateBook}
      onDeleteBook={handleDeleteBook}
      onEditBook={setEditingProject}
      onOpenBook={(projectId) => {
        setCurrentProjectId(projectId);
        setCurrentView("editor");
      }}
      onOpenCreateModal={() => setIsCreating(true)}
      onUpdateBook={handleUpdateBook}
    />
  );
}

export default App;
