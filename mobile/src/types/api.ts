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

/** Mirrors app/schemas/study_session.py. "Cancelled" is schema-reserved
 * but unreachable through any currently documented endpoint. */
export type StudySessionStatus = 'Active' | 'Paused' | 'Finished' | 'Cancelled';

export interface StudySessionTaskSnapshot {
  id: string;
  title: string;
  type: TaskType;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
  subject: TaskSubjectSnapshot | null;
}

/** `active_duration_seconds` is the server-computed *effective* value at
 * response time (includes elapsed time since the open segment if
 * Active) — never a raw stored column to re-derive client-side.
 * `break_eligible` is server-derived; never computed client-side.
 * `next_break_eligible_at` is server-derived from the same inputs as
 * `break_eligible` (Checkpoint 9A) — `null` whenever the session is not
 * Active, otherwise the next instant a break becomes eligible (or `now`
 * if already eligible). Never computed client-side. */
export interface StudySessionRead {
  id: string;
  task_id: string | null;
  task: StudySessionTaskSnapshot | null;
  started_at: string;
  ended_at: string | null;
  active_duration_seconds: number;
  status: StudySessionStatus;
  break_taken: boolean;
  break_eligible: boolean;
  next_break_eligible_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudySessionCreate {
  task_id?: string | null;
}

/** GET /sessions query params — single `status` value only, no IN-list. */
export interface StudySessionListQuery {
  status?: StudySessionStatus;
  limit?: number;
  offset?: number;
}

export type BreakAction = 'TakeBreak' | 'Snooze' | 'Dismiss';

export interface StudySessionBreakRead {
  id: string;
  session_id: string;
  prompted_at: string;
  action: BreakAction;
  duration_minutes: number | null;
}

/** POST /sessions/{id}/break. `duration_minutes` must be omitted for
 * Dismiss (server rejects an explicit value with 422). For TakeBreak it
 * is a recorded label only — the server never auto-resumes after it. */
export interface StudySessionBreakCreate {
  action: BreakAction;
  duration_minutes?: number;
}

export interface SessionBreakActionResult {
  session: StudySessionRead;
  break_event: StudySessionBreakRead;
}

/** Mirrors app/schemas/workload.py / app/schemas/workload_api.py
 * (backend/docs/phase1/11-workload-engine-spec.md §11.4-11.5, as amended by
 * Checkpoint-approved corrections through Batch 4 — the doc's own §11.4
 * JSON sample predates those and is not literally accurate). */
export type WorkloadLevel = 'Low' | 'Moderate' | 'High' | 'Critical';

export type WorkloadRecommendationType =
  | 'Priority'
  | 'Split'
  | 'Reschedule'
  | 'StudyBlock'
  | 'Break'
  | 'Recovery';

export interface WorkloadFactor {
  group: string;
  key: string;
  value: boolean | number | null;
  is_strong: boolean;
  explanation: string;
}

/** `proposed_change` is preview data only — GET /workload/current has no
 * corresponding apply/accept endpoint; never sent back to the server. */
export interface WorkloadRecommendation {
  type: WorkloadRecommendationType;
  title: string;
  explanation: string;
  relevant_task_ids: string[];
  proposed_change: Record<string, unknown> | null;
  rank: number;
  recommendation_engine_version: string;
}

/** GET /workload/current. `raw_score`/`ungated_level` are the pre-gate
 * result; `level` is the sole authoritative field after the §11.2 safety
 * gate — check `gate_applied` before displaying `raw_score` next to
 * `level`, and surface `gate_explanation` when true. `insufficient_data`
 * is true only when there is no evidence at all (no active tasks, no
 * recently completed tasks, no recent/current study session); when true,
 * `recommendations` is always []. */
export interface WorkloadCurrentResponse {
  raw_score: number;
  ungated_level: WorkloadLevel;
  level: WorkloadLevel;
  gate_applied: boolean;
  gate_explanation: string | null;
  strong_signal_count: number;
  confidence: 'full' | 'reduced';
  factors: WorkloadFactor[];
  relevant_task_ids: string[];
  evaluated_at: string;
  engine_version: string;
  insufficient_data: boolean;
  recommendations: WorkloadRecommendation[];
  recommendation_engine_version: string;
}
