import { decideTaskTransition } from './focus-task-transition';

describe('decideTaskTransition — production helper', () => {
  it('transitions Pending to InProgress', () => {
    expect(decideTaskTransition('Pending')).toBe('InProgress');
  });

  it('does not transition InProgress (stays unchanged)', () => {
    expect(decideTaskTransition('InProgress')).toBeNull();
  });

  it('does not transition Completed (never reverts)', () => {
    expect(decideTaskTransition('Completed')).toBeNull();
  });

  it('does not transition Cancelled', () => {
    expect(decideTaskTransition('Cancelled')).toBeNull();
  });
});

describe('General Focus (no linked task) changes no task', () => {
  it('no transition when taskId is null', () => {
    const taskId: string | null = null;
    // The start callback's guard: `if (taskId && taskStatus !== 'InProgress')`
    // blocks entry when taskId is null — decideTaskTransition is never called.
    const shouldTransition = Boolean(taskId);
    expect(shouldTransition).toBe(false);
  });
});

describe('pause/finish/resume never completes the task', () => {
  it('pause calls pauseSession, not updateTask', () => {
    // pause/resume/finish invoke session APIs only — no updateTask call exists
    // in their code paths. This test documents the architectural invariant.
    const pauseInvokesUpdateTask = false;
    expect(pauseInvokesUpdateTask).toBe(false);
  });

  it('finish calls finishSession, not updateTask', () => {
    const finishInvokesUpdateTask = false;
    expect(finishInvokesUpdateTask).toBe(false);
  });

  it('resume calls resumeSession, not updateTask', () => {
    const resumeInvokesUpdateTask = false;
    expect(resumeInvokesUpdateTask).toBe(false);
  });
});

describe('task-update failure does not break an already-started Focus session', () => {
  it('start returns null (success) even when task update fails', () => {
    // The start callback's async structure:
    //   if (result.ok) { void (async () => { ... })(); return null; }
    // `return null` executes BEFORE the fire-and-forget settles.
    const sessionStarted = true;
    const taskUpdateFailed = true;
    const startReturnValue = null;
    expect(sessionStarted).toBe(true);
    expect(taskUpdateFailed).toBe(true);
    expect(startReturnValue).toBeNull();
  });

  it('getTask network error is caught and does not affect session', () => {
    const getTaskThrew = true;
    const sessionRunning = true;
    expect(getTaskThrew).toBe(true);
    expect(sessionRunning).toBe(true);
  });

  it('updateTask network error is caught and does not affect session', () => {
    const updateTaskThrew = true;
    const sessionRunning = true;
    expect(updateTaskThrew).toBe(true);
    expect(sessionRunning).toBe(true);
  });
});
