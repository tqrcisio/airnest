export type DataInterval = { start: Date; end: Date };

export type TaskLogger = {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type TaskContext = {
  dagId: string;
  runId: string;
  taskId: string;
  tryNumber: number;
  logicalDate: Date;
  dataInterval: DataInterval;
  params: Record<string, unknown>;
  signal: AbortSignal;
  logger: TaskLogger;
  output(taskId: string): unknown;
};
