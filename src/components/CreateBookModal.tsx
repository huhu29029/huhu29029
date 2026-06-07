import { open } from "@tauri-apps/plugin-dialog";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { readImageDataUrl } from "../tauriApi";
import type { CreateProjectInput, Project } from "../types/domain";
import { DefaultCover } from "./DefaultCover";

type CreateBookModalProps = {
  project?: Project;
  onClose: () => void;
  onSubmit: (input: CreateProjectInput) => Promise<void>;
};

export function CreateBookModal({ project, onClose, onSubmit }: CreateBookModalProps) {
  const [title, setTitle] = useState(project?.title ?? "");
  const [category, setCategory] = useState(project?.category ?? "玄幻小说");
  const [description, setDescription] = useState(project?.description ?? "");
  const [coverPath, setCoverPath] = useState<string | undefined>(project?.coverPath);
  const [coverPreview, setCoverPreview] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!coverPath) {
      setCoverPreview(undefined);
      return;
    }

    readImageDataUrl(coverPath)
      .then((src) => {
        if (isMounted) setCoverPreview(src);
      })
      .catch((error) => {
        console.error(error);
        if (isMounted) setCoverPreview(undefined);
      });

    return () => {
      isMounted = false;
    };
  }, [coverPath]);

  const chooseCover = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }]
    });

    if (typeof selected === "string") {
      setCoverPath(selected);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      window.alert("请输入小说标题");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        category: category.trim() || "玄幻小说",
        description: description.trim(),
        coverPath
      });
      onClose();
    } catch (error) {
      console.error(error);
      window.alert(`保存书籍失败：${String(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="create-book-modal" onSubmit={submit}>
        <header>
          <h2>{project ? "修改书籍信息" : "创建书籍"}</h2>
          <button aria-label="关闭" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="create-book-body">
          <div className="cover-picker">
            <div className="cover-preview">
              {coverPreview ? <img alt="封面预览" src={coverPreview} /> : <DefaultCover />}
            </div>
            <button onClick={chooseCover} type="button">
              选择封面
            </button>
          </div>

          <div className="book-form-fields">
            <label>
              小说标题
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="请输入书名" />
            </label>
            <label>
              分类
              <input value={category} onChange={(event) => setCategory(event.target.value)} />
            </label>
            <label>
              简介
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="可选，写一点这本书的设定或方向"
              />
            </label>
          </div>
        </div>

        <footer>
          <button onClick={onClose} type="button">
            取消
          </button>
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "保存中..." : project ? "保存" : "创建"}
          </button>
        </footer>
      </form>
    </div>
  );
}
