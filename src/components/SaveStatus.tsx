import type { SaveStatus as SaveStatusValue } from "../types/domain";

const labels: Record<SaveStatusValue, string> = {
  editing: "编辑中",
  saving: "保存中",
  saved: "已保存",
  failed: "保存失败"
};

type SaveStatusProps = {
  status: SaveStatusValue;
};

export function SaveStatus({ status }: SaveStatusProps) {
  return <span className={`save-status ${status}`}>{labels[status]}</span>;
}
