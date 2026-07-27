/** Shared API types — mirrors docs/phase1/10-api-contract.md §10.14 error contract. */

export interface ApiError {
  error: {
    code: string;
    message: string;
    field: string | null;
  };
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError['error']; status: number };

/** Mirrors docs/phase1/09-data-dictionary.md §9.1. */
export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  study_preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdate {
  display_name?: string;
  timezone?: string;
  study_preferences?: Record<string, unknown>;
}

/** Mirrors docs/phase1/09-data-dictionary.md §9.2 / app/schemas/subject.py. */
export type SubjectColorToken = 'deepViolet' | 'teal' | 'coral' | 'warmYellow' | 'lavender' | 'mint';

export interface Subject {
  id: string;
  name: string;
  color_token: SubjectColorToken;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubjectCreate {
  name: string;
  color_token: SubjectColorToken;
}

/** PATCH /subjects/{id}. An entirely empty body, or an explicit `null` for
 * any field that IS supplied, is rejected server-side — omit a field to
 * leave it unchanged instead. `archived` is a command flag; the server
 * derives `archived_at` itself. */
export interface SubjectUpdate {
  name?: string;
  color_token?: SubjectColorToken;
  archived?: boolean;
}

/** Mirrors docs/phase1/09-data-dictionary.md §9.3 / app/schemas/task.py. */
export type TaskType =
  | 'Assignment'
  | 'Quiz'
  | 'Project'
  | 'Presentation'
  | 'Lab'
  | 'Midterm'
  | 'FinalExam'
  | 'StudySession'
  | 'Other';

export type TaskPriority = 'Low' | 'Medium' | 'High';
export type TaskStatus = 'Pending' | 'InProgress' | 'Completed' | 'Cancelled';

export type TaskSortToken =
  | 'deadline_asc'
  | 'deadline_desc'
  | 'priority_asc'
  | 'priority_desc'
  | 'created_at_asc'
  | 'created_at_desc';

export interface TaskSubjectSnapshot {
  id: string;
  name: string;
  color_token: SubjectColorToken;
  archived: boolean;
}

export interface Subtask {
  id: string;
  title: string;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  subject_id: string | null;
  subject: TaskSubjectSnapshot | null;
  title: string;
  type: TaskType;
  deadline: string;
  priority: TaskPriority;
  estimate_hours: number | null;
  status: TaskStatus;
  notes: string | null;
  completed_at: string | null;
  reschedule_count: number;
  created_at: string;
  updated_at: string;
  /** Ordered (created_at, id). Populated on GET /tasks/{id}, PATCH /tasks/{id},
   * and GET /tasks/today; always [] on GET /tasks (list) and POST /tasks. */
  subtasks: Subtask[];
}

export interface TaskCreate {
  subject_id?: string | null;
  title: string;
  type: TaskType;
  /** ISO 8601 with an explicit UTC offset (e.g. via `Date#toISOString()`) — the
   * backend rejects a naive/offset-less datetime string. */
  deadline: string;
  priority: TaskPriority;
  estimate_hours?: number | null;
  notes?: string | null;
}

/** PATCH /tasks/{id}. `subject_id`/`estimate_hours`/`notes` are nullable
 * columns — explicit `null` clears them. `title`/`type`/`deadline`/
 * `priority`/`status` are NOT NULL — omit to leave unchanged, never send
 * null for these. `completed_at`/`reschedule_count` are server-derived and
 * never sent by the client. */
export interface TaskUpdate {
  subject_id?: string | null;
  title?: string;
  type?: TaskType;
  deadline?: string;
  priority?: TaskPriority;
  estimate_hours?: number | null;
  status?: TaskStatus;
  notes?: string | null;
}

export interface TaskListQuery {
  status?: TaskStatus;
  subject_id?: string;
  type?: TaskType;
  due_before?: string;
  due_after?: string;
  search?: string;
  sort?: TaskSortToken;
  limit?: number;
  offset?: number;
}

/** GET /tasks/today — groups overlap by design (a task can appear in more
 * than one). */
export interface TaskTodayView {
  overdue: Task[];
  due_soon: Task[];
  pending: Task[];
  high_priority: Task[];
}

export interface SubtaskCreate {
  title: string;
}

/** PATCH /tasks/{taskId}/subtasks/{id}. Both fields are NOT NULL — an
 * empty body or an explicit null for a supplied field is rejected
 * server-side; omit a field to leave it unchanged. */
export interface SubtaskUpdate {
  title?: string;
  is_complete?: boolean;
}

/** Mirrors app/schemas/planner.py — deliberately NOT the full Task shape:
 * no subtasks/notes/completed_at/reschedule_count/estimate_hours. */
export interface PlannerTaskItem {
  id: string;
  subject_id: string | null;
  subject: TaskSubjectSnapshot | null;
  title: string;
  type: TaskType;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
}

export interface CalendarResponse {
  tasks: PlannerTaskItem[];
  study_blocks: StudyBlockRead[];
}

export interface DayView {
  date: string;
  tasks: PlannerTaskItem[];
  study_blocks: StudyBlockRead[];
}

/** Mirrors app/schemas/study_block.py. */
export interface StudyBlockTaskSnapshot {
  id: string;
  title: string;
  type: TaskType;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
  subject: TaskSubjectSnapshot | null;
}

export interface StudyBlockRead {
  id: string;
  task_id: string | null;
  task: StudyBlockTaskSnapshot | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
}

export interface StudyBlockCreate {
  task_id?: string | null;
  starts_at: string;
  ends_at: string;
}

/** PATCH /study-blocks/{id}. `task_id: null` unlinks (real command —
 * nullable column). `starts_at`/`ends_at` are NOT NULL — omit to leave
 * unchanged, never send null for these. Body must not be entirely empty. */
export interface StudyBlockUpdate {
  task_id?: string | null;
  starts_at?: string;
  ends_at?: string;
}
