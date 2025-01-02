export type Task = {
  id: number;
  title: string;
  description: string;
  reward: number;
  type: string;
  metadata: any;
  completed: boolean;
  taskStartedAt: Date | null;
};

export function convertToTask(task: any): Task {
  const startedAt = task.rewarded_task?.[0]?.task_started_at;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    reward: task.reward,
    type: task.type,
    metadata: task.metadata,
    completed: task.rewarded_task?.[0]?.completed ?? false,
    taskStartedAt: startedAt ? new Date(startedAt) : null,
  };
}
