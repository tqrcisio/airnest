export type DataInterval = { start: Date; end: Date };

export type TaskContext = {
  dagId: string;
  runId: string;
  taskId: string;
  tryNumber: number;
  logicalDate: Date;
  dataInterval: DataInterval;
  params: Record<string, unknown>;
  signal: AbortSignal;
  output(taskId: string): unknown;
};
