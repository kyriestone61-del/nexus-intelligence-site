export interface TaskRecord {
  id: string;
  company_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  assignee: 'client' | 'nexus' | string;
  status: string;
  priority: string | null;
  due_date: string | null;
  dependency_task_id: string | null;
  task_type: string | null;
  phase: string | null;
  instructions: string | null;
  form_schema: Record<string, unknown>[] | null;
  response_data: Record<string, unknown> | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TaskDependency {
  taskId: string;
  parentTaskId: string;
  depth: number;
  complete: boolean;
  parentTitle: string;
  parentStatus: string;
}

export type ClientActionState =
  | 'WAITING_ON_YOU'
  | 'UPCOMING'
  | 'NEXUS_WORKING'
  | 'READY_TO_REVIEW'
  | 'COMPLETE'
  | 'BLOCKED';

export interface EvaluatedTask {
  task: TaskRecord;
  state: ClientActionState;
  dependencies: TaskDependency[];
  prerequisitesSatisfied: boolean;
  blockedByTaskId: string | null;
  blockedByTitle: string | null;
  cycleDetected: boolean;
}

export interface WorkspaceCurrentActionContext {
  evaluated: EvaluatedTask[];
  now: EvaluatedTask[];
  next: EvaluatedTask[];
  done: EvaluatedTask[];
  nexusWorking: EvaluatedTask[];
  primaryAction: null | {
    taskId: string;
    title: string;
    why: string;
    provide: string;
    afterward: string;
    dueDate: string | null;
    taskType: string | null;
    raw: TaskRecord;
  };
  secondaryActionable: EvaluatedTask[];
}

export interface NotificationRecord {
  id?: string;
  kind?: string;
  notification_type?: string;
  title?: string;
  message?: string;
  status?: string;
  related_type?: string;
  related_id?: string;
  parent_initiative_id?: string;
  category?: string;
  created_at?: string;
  read_at?: string | null;
  is_unread?: boolean;
}

export interface NotificationGroup {
  id: string;
  category: string;
  title: string;
  itemCount: number;
  completedCount: number;
  unreadCount: number;
  relatedIds: string[];
  items: NotificationRecord[];
  cta: string;
  newestAt: string;
}

export function evaluateClientActionState(tasks: TaskRecord[]): EvaluatedTask[];
export function aggregateNotifications(notifications: NotificationRecord[]): NotificationGroup[];
export function getWorkspaceCurrentActionContext(clientId: string, options?: { sb?: unknown; tasks?: TaskRecord[] }): Promise<WorkspaceCurrentActionContext>;