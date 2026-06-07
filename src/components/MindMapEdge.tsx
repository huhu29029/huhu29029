import type { OutlineMindEdge, OutlineMindNode } from "../types/domain";
import { MIND_NODE_HEIGHT, MIND_NODE_WIDTH } from "./MindMapNode";

type MindMapEdgeProps = {
  edge: OutlineMindEdge;
  nodes: OutlineMindNode[];
  selected: boolean;
  onSelect: (edge: OutlineMindEdge) => void;
};

export function MindMapEdge({ edge, nodes, selected, onSelect }: MindMapEdgeProps) {
  const source = nodes.find((node) => node.id === edge.sourceNodeId);
  const target = nodes.find((node) => node.id === edge.targetNodeId);
  if (!source || !target) {
    return null;
  }

  const start = {
    x: source.x + MIND_NODE_WIDTH,
    y: source.y + MIND_NODE_HEIGHT / 2
  };
  const end = {
    x: target.x,
    y: target.y + MIND_NODE_HEIGHT / 2
  };
  const curve = Math.max(80, Math.abs(end.x - start.x) / 2);
  const path = `M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${end.x - curve} ${end.y}, ${end.x} ${end.y}`;
  const labelX = (start.x + end.x) / 2;
  const labelY = (start.y + end.y) / 2 - 8;

  return (
    <g className={selected ? "mind-edge selected" : "mind-edge"} onClick={(event) => {
      event.stopPropagation();
      onSelect(edge);
    }}>
      <path className="mind-edge-hitbox" d={path} />
      <path className="mind-edge-path" d={path} markerEnd="url(#mind-arrow)" />
      {edge.label && (
        <text className="mind-edge-label" x={labelX} y={labelY}>
          {edge.label}
        </text>
      )}
    </g>
  );
}
