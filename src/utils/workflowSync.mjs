const API_ROOT = 'https://api.github.com';
const OWNER = 'MurphyKwok';
const REPOSITORY = 'keep_running';
const WORKFLOW_FILE = 'run_data_sync.yml';
const WORKFLOW_REF = 'main';
const API_VERSION = '2022-11-28';
const DISPATCH_PATH = `/repos/${OWNER}/${REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
const RUNS_PATH = `/repos/${OWNER}/${REPOSITORY}/actions/runs`;

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
    'Content-Type': 'application/json',
  };
}

async function githubRequest(path, token, init, fetchImpl) {
  const response = await fetchImpl(`${API_ROOT}${path}`, {
    ...init,
    headers: headers(token),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message ? `：${body.message}` : '';
    } catch {
      detail = '';
    }
    const error = new Error(
      `GitHub 请求失败（HTTP ${response.status}）${detail}`
    );
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function dispatchWorkflow(token, fetchImpl = fetch) {
  if (!token) {
    throw new Error('请先配置 GitHub 访问令牌');
  }
  await githubRequest(
    DISPATCH_PATH,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ ref: WORKFLOW_REF }),
    },
    fetchImpl
  );
}

export function formatSyncError(error) {
  if (error instanceof Error) {
    if (error.status === 401) {
      return 'GitHub 访问令牌无效或已过期，请重新配置。';
    }
    if (error.status === 403) {
      return 'GitHub 拒绝访问，请确认令牌具有 Actions 的读写权限。';
    }
    if (error instanceof TypeError) {
      return '无法连接 GitHub，请检查网络后重试。';
    }
    return error.message;
  }
  return '同步请求失败，请稍后重试。';
}

export async function findDispatchedRun(token, requestedAt, fetchImpl = fetch) {
  const payload = await githubRequest(
    `${RUNS_PATH}?event=workflow_dispatch&branch=${WORKFLOW_REF}&per_page=20`,
    token,
    {},
    fetchImpl
  );
  const requestedAtMs = Date.parse(requestedAt);
  return (
    payload.workflow_runs
      .filter((run) => {
        return (
          run.event === 'workflow_dispatch' &&
          Number.isFinite(Date.parse(run.created_at)) &&
          Date.parse(run.created_at) >= requestedAtMs
        );
      })
      .sort((left, right) => right.id - left.id)[0] ?? null
  );
}

export async function getWorkflowRun(token, runId, fetchImpl = fetch) {
  return githubRequest(`${RUNS_PATH}/${runId}`, token, {}, fetchImpl);
}

export async function getWorkflowJobs(token, runId, fetchImpl = fetch) {
  return githubRequest(
    `${RUNS_PATH}/${runId}/jobs?per_page=100`,
    token,
    {},
    fetchImpl
  );
}

export function workflowProgress(run, jobsPayload) {
  if (!run) {
    return {
      phase: 'idle',
      percent: 0,
      completedSteps: 0,
      totalSteps: 0,
      jobName: '',
      stepName: '',
      runStatus: 'idle',
      runConclusion: null,
      runUrl: '',
    };
  }

  const jobs = jobsPayload?.jobs ?? [];
  const steps = jobs.flatMap((job) => job.steps ?? []);
  const completedSteps = steps.filter(
    (step) => step.status === 'completed'
  ).length;
  const totalSteps = steps.length;
  const activeJob = jobs.find((job) => job.status === 'in_progress');
  const queuedJob = jobs.find((job) => job.status === 'queued');
  const displayedJob = activeJob ?? queuedJob;
  const activeStep = displayedJob?.steps?.find(
    (step) => step.status === 'in_progress'
  );
  const queuedStep = displayedJob?.steps?.find(
    (step) => step.status === 'queued'
  );

  let phase = 'running';
  let percent;
  if (run.status === 'completed') {
    percent = 100;
    phase = run.conclusion === 'success' ? 'success' : 'failed';
  } else if (run.status === 'queued' || run.status === 'waiting') {
    phase = 'queued';
    percent = totalSteps
      ? Math.min(8, Math.round((completedSteps / totalSteps) * 8))
      : 3;
  } else if (totalSteps) {
    percent = Math.min(95, Math.round(10 + (completedSteps / totalSteps) * 85));
  } else {
    percent = 10;
  }

  return {
    phase,
    percent,
    completedSteps,
    totalSteps,
    jobName: displayedJob?.name ?? '',
    stepName: activeStep?.name ?? queuedStep?.name ?? '',
    runStatus: run.status,
    runConclusion: run.conclusion ?? null,
    runUrl: run.html_url ?? '',
  };
}

export function shouldRefreshAfterSync(progress) {
  return progress?.phase === 'success';
}

export function isAndroidApp(userAgent) {
  return /KeepRunningAndroid\/\d+(?:\.\d+)*/i.test(userAgent ?? '');
}
