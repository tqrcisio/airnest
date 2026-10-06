import { useMemo } from 'react';
import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import type { DagManifest, FieldManifest, TaskInstance } from '@/lib/types';
import { optionOf, toneBadge } from '@/manifest/tone';

type TaskNodeData = { taskId: string; label?: string; toneClass: string; selected: boolean };

const columnGap = 230;
const rowGap = 76;

function TaskNode({ data }: NodeProps<Node<TaskNodeData>>) {
  return (
    <div
      className={`min-w-36 rounded-xl border bg-background px-3 py-2 text-left shadow-xs ${data.selected ? 'border-ring ring-2 ring-ring/40' : 'border-border'}`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="font-mono text-sm text-foreground">{data.taskId}</div>
      {data.label && (
        <span className={`mt-1 inline-block rounded-full px-2 text-xs font-medium ${data.toneClass}`}>
          {data.label}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

function depths(dag: DagManifest) {
  const depth = new Map<string, number>();
  const visit = (taskId: string): number => {
    const known = depth.get(taskId);
    if (known !== undefined) return known;
    const task = dag.tasks.find((candidate) => candidate.id === taskId)!;
    const value = task.upstream.length === 0 ? 0 : Math.max(...task.upstream.map(visit)) + 1;
    depth.set(taskId, value);
    return value;
  };
  dag.tasks.forEach((task) => visit(task.id));
  return depth;
}

type DagGraphProps = {
  dag: DagManifest;
  instances?: TaskInstance[];
  taskState?: FieldManifest;
  selectedTask?: string | null;
  onSelectTask?: (taskId: string) => void;
};

export function DagGraph({ dag, instances, taskState, selectedTask, onSelectTask }: DagGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const depth = depths(dag);
    const columns = new Map<number, string[]>();
    for (const task of dag.tasks)
      columns.set(depth.get(task.id)!, [...(columns.get(depth.get(task.id)!) ?? []), task.id]);
    const tallest = Math.max(...[...columns.values()].map((column) => column.length));

    const nodes: Node<TaskNodeData>[] = dag.tasks.map((task) => {
      const column = columns.get(depth.get(task.id)!)!;
      const row = column.indexOf(task.id);
      const offset = ((tallest - column.length) * rowGap) / 2;
      const state = instances?.find((instance) => instance.taskId === task.id)?.state;
      const option = state ? optionOf(taskState, state) : undefined;
      return {
        id: task.id,
        type: 'task',
        position: { x: depth.get(task.id)! * columnGap, y: offset + row * rowGap },
        data: {
          taskId: task.id,
          label: option?.label ?? state,
          toneClass: toneBadge[option?.tone ?? 'neutral'],
          selected: selectedTask === task.id,
        },
      };
    });
    const edges: Edge[] = dag.tasks.flatMap((task) =>
      task.upstream.map((parent) => ({
        id: `${parent}->${task.id}`,
        source: parent,
        target: task.id,
        type: 'smoothstep',
      })),
    );
    return { nodes, edges };
  }, [dag, instances, taskState, selectedTask]);

  return (
    <div className="h-56 rounded-xl border sm:h-72">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelectTask?.(node.id)}
      >
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
