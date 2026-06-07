type ChapterEditorProps = {
  content: string;
  disabled?: boolean;
  onChange: (content: string) => void;
  onSelectionChange?: (selection: { end: number; start: number }) => void;
};

export function ChapterEditor({ content, disabled = false, onChange, onSelectionChange }: ChapterEditorProps) {
  const emitSelection = (target: HTMLTextAreaElement) => {
    onSelectionChange?.({ start: target.selectionStart, end: target.selectionEnd });
  };

  return (
    <section className="chapter-editor" aria-label="章节正文编辑区">
      <textarea
        aria-label="章节正文"
        disabled={disabled}
        onBlur={(event) => emitSelection(event.currentTarget)}
        onChange={(event) => {
          onChange(event.target.value);
          emitSelection(event.currentTarget);
        }}
        onKeyUp={(event) => emitSelection(event.currentTarget)}
        onMouseUp={(event) => emitSelection(event.currentTarget)}
        onSelect={(event) => emitSelection(event.currentTarget)}
        placeholder="在这里开始输入小说正文..."
        spellCheck={false}
        value={content}
      />
    </section>
  );
}
