import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { OutlineMindEdge, OutlineMindNode } from "../types/domain";
import { MindMapEdge } from "./MindMapEdge";
import { MIND_NODE_HEIGHT, MIND_NODE_WIDTH, MindMapNode } from "./MindMapNode";
import { MindMapSidePanel } from "./MindMapSidePanel";

type MindMapPanelProps = {
  draftEdge?: OutlineMindEdge;
  draftNode?: OutlineMindNode;
  edges: OutlineMindEdge[];
  nodes: OutlineMindNode[];
  selectedEdgeId?: string;
  selectedNodeId?: string;
  onAddNode: () => void;
  onApplyEdge: () => void;
  onApplyNode: () => void;
  onClearMindMap: () => void;
  onCreateEdge: (sourceNodeId: string, targetNodeId: string) => void;
  onDeleteEdge: () => void;
  onDeleteNode: () => void;
  onDraftEdgeChange: (edge: OutlineMindEdge) => void;
  onDraftNodeChange: (node: OutlineMindNode) => void;
  onExportImage: () => void;
  onGenerateFromText: () => void;
  onMoveNode: (node: OutlineMindNode) => void;
  onMoveNodeEnd: (node: OutlineMindNode) => void;
  onSelectEdge: (edge: OutlineMindEdge) => void;
  onSelectNode: (node: OutlineMindNode) => void;
  onClearSelection: () => void;
};

type DragState = {
  offsetX: number;
  offsetY: number;
  nodeId: string;
};

type ConnectState = {
  fromNodeId: string;
  targetNodeId?: string;
  x: number;
  y: number;
};

export function MindMapPanel({
  draftEdge,
  draftNode,
  edges,
  nodes,
  selectedEdgeId,
  selectedNodeId,
  onAddNode,
  onApplyEdge,
  onApplyNode,
  onClearMindMap,
  onCreateEdge,
  onDeleteEdge,
  onDeleteNode,
  onDraftEdgeChange,
  onDraftNodeChange,
  onExportImage,
  onGenerateFromText,
  onMoveNode,
  onMoveNodeEnd,
  onSelectEdge,
  onSelectNode,
  onClearSelection
}: MindMapPanelProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const latestNodesRef = useRef(nodes);
  const [draggingNode, setDraggingNode] = useState<DragState>();
  const [connecting, setConnecting] = useState<ConnectState>();

  useEffect(() => {
    latestNodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const point = toCanvasPoint(canvas, event.clientX, event.clientY);
      if (draggingNode) {
        event.preventDefault();
        const node = latestNodesRef.current.find((item) => item.id === draggingNode.nodeId);
        if (node) {
          onMoveNode({
            ...node,
            x: Math.max(0, point.x - draggingNode.offsetX),
            y: Math.max(0, point.y - draggingNode.offsetY)
          });
        }
      }

      if (connecting) {
        event.preventDefault();
        setConnecting((current) => (current ? { ...current, x: point.x, y: point.y } : current));
      }
    };

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      if (draggingNode) {
        const node = latestNodesRef.current.find((item) => item.id === draggingNode.nodeId);
        if (node) onMoveNodeEnd(node);
        setDraggingNode(undefined);
      }

      if (connecting) {
        const releaseTarget = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>(".mind-map-node")
          ?.dataset.nodeId;
        const targetNodeId = releaseTarget ?? connecting.targetNodeId;
        if (targetNodeId && targetNodeId !== connecting.fromNodeId) {
          onCreateEdge(connecting.fromNodeId, targetNodeId);
        }
        setConnecting(undefined);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [connecting, draggingNode, onCreateEdge, onMoveNode, onMoveNodeEnd]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      if (selectedEdgeId) {
        event.preventDefault();
        onDeleteEdge();
      } else if (selectedNodeId) {
        event.preventDefault();
        onDeleteNode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDeleteEdge, onDeleteNode, selectedEdgeId, selectedNodeId]);

  const startNodeDrag = (node: OutlineMindNode, event: PointerEvent<HTMLButtonElement>) => {
    if ((event.target as HTMLElement).closest(".connection-handle")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    event.preventDefault();
    event.stopPropagation();
    const point = toCanvasPoint(canvas, event.clientX, event.clientY);
    onSelectNode(node);
    setDraggingNode({
      nodeId: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y
    });
  };

  const startConnection = (nodeId: string, event: PointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    const source = nodes.find((node) => node.id === nodeId);
    if (!canvas || !source) return;

    event.preventDefault();
    event.stopPropagation();
    const point = toCanvasPoint(canvas, event.clientX, event.clientY);
    setConnecting({ fromNodeId: nodeId, x: point.x, y: point.y });
  };

  const sourceNode = connecting ? nodes.find((node) => node.id === connecting.fromNodeId) : undefined;
  const temporaryPath =
    connecting && sourceNode
      ? makeEdgePath(sourceNode.x + MIND_NODE_WIDTH, sourceNode.y + MIND_NODE_HEIGHT / 2, connecting.x, connecting.y)
      : undefined;
  const canvasWidth = Math.max(1200, ...nodes.map((node) => node.x + MIND_NODE_WIDTH + 300));
  const canvasHeight = Math.max(800, ...nodes.map((node) => node.y + MIND_NODE_HEIGHT + 250));

  return (
    <section className="mind-panel">
      <header className="outline-panel-header">
        <strong>思维导图区</strong>
        <div>
          <button onClick={onAddNode} type="button">
            + 节点
          </button>
          <button className="ghost" onClick={onGenerateFromText} type="button">
            从大纲生成
          </button>
          <button className="ghost" onClick={onClearMindMap} type="button">
            清空导图
          </button>
          <button className="ghost" onClick={onExportImage} type="button">
            导出图片
          </button>
        </div>
      </header>
      <div className="mind-body">
        <div className={draggingNode ? "mind-canvas dragging" : "mind-canvas"} onClick={onClearSelection} ref={canvasRef}>
          <svg className="mind-edges" style={{ height: canvasHeight, width: canvasWidth }}>
            <defs>
              <marker id="mind-arrow" markerHeight="10" markerWidth="10" orient="auto" refX="9" refY="5" viewBox="0 0 10 10">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {edges.map((edge) => (
              <MindMapEdge edge={edge} key={edge.id} nodes={nodes} selected={selectedEdgeId === edge.id} onSelect={onSelectEdge} />
            ))}
            {temporaryPath && <path className="mind-edge-temporary" d={temporaryPath} />}
          </svg>
          {nodes.map((node) => (
            <MindMapNode
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              onConnectStart={startConnection}
              onConnectTarget={(nodeId) => {
                if (connecting) {
                  setConnecting((current) => (current ? { ...current, targetNodeId: nodeId } : current));
                }
              }}
              onDragStart={startNodeDrag}
              onSelect={onSelectNode}
            />
          ))}
        </div>
        <MindMapSidePanel
          draftEdge={draftEdge}
          draftNode={draftNode}
          nodes={nodes}
          onApplyEdge={onApplyEdge}
          onApplyNode={onApplyNode}
          onDeleteEdge={onDeleteEdge}
          onDeleteNode={onDeleteNode}
          onEdgeChange={onDraftEdgeChange}
          onNodeChange={onDraftNodeChange}
        />
      </div>
    </section>
  );
}

function toCanvasPoint(canvas: HTMLDivElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left + canvas.scrollLeft,
    y: clientY - rect.top + canvas.scrollTop
  };
}

function makeEdgePath(startX: number, startY: number, endX: number, endY: number) {
  const curve = Math.max(80, Math.abs(endX - startX) / 2);
  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
}
