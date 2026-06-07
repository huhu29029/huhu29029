import type { OutlineMindEdge, OutlineMindNode, OutlineNodeType } from "../types/domain";
import { nodeTypeLabels } from "./MindMapNode";

type MindMapSidePanelProps = {
  draftEdge?: OutlineMindEdge;
  draftNode?: OutlineMindNode;
  nodes: OutlineMindNode[];
  onApplyEdge: () => void;
  onApplyNode: () => void;
  onDeleteEdge: () => void;
  onDeleteNode: () => void;
  onEdgeChange: (edge: OutlineMindEdge) => void;
  onNodeChange: (node: OutlineMindNode) => void;
};

const nodeTypes = Object.entries(nodeTypeLabels) as Array<[OutlineNodeType, string]>;

export function MindMapSidePanel({
  draftEdge,
  draftNode,
  nodes,
  onApplyEdge,
  onApplyNode,
  onDeleteEdge,
  onDeleteNode,
  onEdgeChange,
  onNodeChange
}: MindMapSidePanelProps) {
  if (draftEdge) {
    const source = nodes.find((node) => node.id === draftEdge.sourceNodeId);
    const target = nodes.find((node) => node.id === draftEdge.targetNodeId);

    return (
      <aside className="mind-side-panel">
        <div className="mind-detail-block">
          <span>当前关联</span>
          <strong>
            {source?.title ?? "未知节点"} → {target?.title ?? "未知节点"}
          </strong>
          <p>{draftEdge.label || "暂无标签"}</p>
        </div>
        <label>
          关联类型
          <input
            value={draftEdge.edgeType}
            onChange={(event) => onEdgeChange({ ...draftEdge, edgeType: event.target.value })}
          />
        </label>
        <label>
          标签
          <input value={draftEdge.label ?? ""} onChange={(event) => onEdgeChange({ ...draftEdge, label: event.target.value })} />
        </label>
        <button onClick={onApplyEdge} type="button">
          保存关联
        </button>
        <button className="danger" onClick={onDeleteEdge} type="button">
          删除关联
        </button>
      </aside>
    );
  }

  if (!draftNode) {
    return (
      <aside className="mind-side-panel">
        <p>请选择节点或关联线</p>
      </aside>
    );
  }

  return (
    <aside className="mind-side-panel">
      <div className="mind-detail-block">
        <span>当前节点</span>
        <strong>{draftNode.title}</strong>
        <p>{draftNode.description || "暂无说明"}</p>
      </div>
      <label>
        节点类型
        <select
          value={draftNode.nodeType}
          onChange={(event) => onNodeChange({ ...draftNode, nodeType: event.target.value as OutlineNodeType })}
        >
          {nodeTypes.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        标题
        <input value={draftNode.title} onChange={(event) => onNodeChange({ ...draftNode, title: event.target.value })} />
      </label>
      <label>
        说明
        <textarea value={draftNode.description} onChange={(event) => onNodeChange({ ...draftNode, description: event.target.value })} />
      </label>
      <button onClick={onApplyNode} type="button">
        应用修改
      </button>
      <button className="danger" onClick={onDeleteNode} type="button">
        删除节点
      </button>
    </aside>
  );
}
