import type { PointerEvent } from "react";
import type { OutlineMindNode } from "../types/domain";

export const nodeTypeLabels: Record<OutlineMindNode["nodeType"], string> = {
  world: "世界观",
  main_character: "主角团",
  protagonist_group: "主角团",
  protagonist: "主角",
  role: "配角",
  supporting_character: "配角",
  main_plot: "主线剧情",
  branch_plot: "支线剧情",
  foreshadowing: "伏笔",
  twist: "反转",
  conflict: "矛盾"
};

type MindMapNodeProps = {
  node: OutlineMindNode;
  selected: boolean;
  onConnectStart: (nodeId: string, event: PointerEvent<HTMLElement>) => void;
  onConnectTarget: (nodeId: string) => void;
  onDragStart: (node: OutlineMindNode, event: PointerEvent<HTMLButtonElement>) => void;
  onSelect: (node: OutlineMindNode) => void;
};

export const MIND_NODE_WIDTH = 160;
export const MIND_NODE_HEIGHT = 84;

export function MindMapNode({
  node,
  selected,
  onConnectStart,
  onConnectTarget,
  onDragStart,
  onSelect
}: MindMapNodeProps) {
  return (
    <button
      className={`mind-map-node ${node.nodeType} ${selected ? "selected" : ""}`}
      data-node-id={node.id}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node);
      }}
      onPointerDown={(event) => onDragStart(node, event)}
      onPointerEnter={() => onConnectTarget(node.id)}
      style={{ left: node.x, top: node.y }}
      type="button"
    >
      <span>{nodeTypeLabels[node.nodeType]}</span>
      <strong>{node.title}</strong>
      <small>{node.description || "暂无说明"}</small>
      <span
        aria-label="连接到此节点"
        className="connection-handle input"
        onPointerEnter={() => onConnectTarget(node.id)}
      />
      <span
        aria-label="从此节点创建关联"
        className="connection-handle output"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => onConnectStart(node.id, event)}
      />
    </button>
  );
}
