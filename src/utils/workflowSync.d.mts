export interface WorkflowProgress {
  phase: 'idle' | 'queued' | 'running' | 'success' | 'failed';
  percent: number;
  completedSteps: number;
  totalSteps: number;
  jobName: string;
  stepName: string;
  runStatus: string;
  runConclusion: string | null;
  runUrl: string;
}

export interface WorkflowRun {
  id: number;
  event?: string;
  created_at?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
}

export function dispatchWorkflow(
  token: string,
  fetchImpl?: typeof fetch
): Promise<void>;

export function formatSyncError(error: unknown): string;

export function getLatestWorkflowDispatchRun(
  token: string,
  fetchImpl?: typeof fetch
): Promise<WorkflowRun | null>;

export function findDispatchedRun(
  token: string,
  baselineRunId: number,
  fetchImpl?: typeof fetch
): Promise<WorkflowRun | null>;

export function isResumableSyncSession(session: unknown): boolean;

export function getWorkflowRun(
  token: string,
  runId: number,
  fetchImpl?: typeof fetch
): Promise<WorkflowRun>;

export function getWorkflowJobs(
  token: string,
  runId: number,
  fetchImpl?: typeof fetch
): Promise<Record<string, unknown>>;

export function workflowProgress(
  run: WorkflowRun | null,
  jobsPayload?: Record<string, unknown>
): WorkflowProgress;

export function shouldRefreshAfterSync(progress: WorkflowProgress): boolean;

export function androidAppVersion(userAgent: string): string;
export interface SyncClient {
  kind: 'web' | 'android';
  label: string;
  appVersion: string;
}

export function resolveSyncClient(userAgent: string): SyncClient;

export function isAndroidApp(userAgent: string): boolean;
