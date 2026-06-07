import { useEffect, useState } from "react";
import { readImageDataUrl } from "../tauriApi";
import type { Project } from "../types/domain";
import { DefaultCover } from "./DefaultCover";

type BookCardProps = {
  project: Project;
  onContextMenu: (project: Project, position: { x: number; y: number }) => void;
  onOpen: (projectId: string) => void;
};

export function BookCard({ project, onContextMenu, onOpen }: BookCardProps) {
  const [coverSrc, setCoverSrc] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    if (!project.coverPath) {
      setCoverSrc(undefined);
      return;
    }

    readImageDataUrl(project.coverPath)
      .then((src) => {
        if (isMounted) setCoverSrc(src);
      })
      .catch((error) => {
        console.error(error);
        if (isMounted) setCoverSrc(undefined);
      });

    return () => {
      isMounted = false;
    };
  }, [project.coverPath]);

  return (
    <button
      className="book-card"
      onClick={() => onOpen(project.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(project, { x: event.clientX, y: event.clientY });
      }}
      type="button"
    >
      <div className="book-cover-frame">
        {coverSrc ? <img alt={`${project.title} 封面`} src={coverSrc} /> : <DefaultCover />}
      </div>
      <strong title={project.title}>{project.title}</strong>
      <span>分类：{project.category}</span>
      <span>最近创作：{formatDate(project.lastEditedAt)}</span>
    </button>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}
