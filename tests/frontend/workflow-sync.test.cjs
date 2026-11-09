const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const modulePath = pathToFileURL(
  path.join(__dirname, '..', '..', 'src', 'utils', 'workflowSync.mjs')
).href;

function response(status, body) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('dispatches only the configured Run Data Sync workflow on main', async () => {
  const { dispatchWorkflow } = await import(modulePath);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return response(204, null);
  };

  await dispatchWorkflow('fine-grained-token', fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://api.github.com/repos/MurphyKwok/keep_running/actions/workflows/run_data_sync.yml/dispatches'
  );
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(
    calls[0].init.headers.Authorization,
    'Bearer fine-grained-token'
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), { ref: 'main' });
});

test('finds the newly dispatched run without selecting scheduled or older runs', async () => {
  const { findDispatchedRun } = await import(modulePath);
  const fetchImpl = async () =>
    response(200, {
      workflow_runs: [
        {
          id: 30,
          event: 'schedule',
          created_at: '2026-11-09T12:00:02Z',
        },
        {
          id: 29,
          event: 'workflow_dispatch',
          created_at: '2026-11-09T11:59:00Z',
        },
        {
          id: 31,
          event: 'workflow_dispatch',
          created_at: '2026-11-09T12:00:01Z',
        },
      ],
    });

  const run = await findDispatchedRun(
    'fine-grained-token',
    '2026-11-09T12:00:00Z',
    fetchImpl
  );

  assert.equal(run.id, 31);
});

test('reports completed workflow steps and the active job and step', async () => {
  const { workflowProgress } = await import(modulePath);
  const run = {
    id: 42,
    status: 'in_progress',
    conclusion: null,
    html_url: 'https://github.com/MurphyKwok/keep_running/actions/runs/42',
  };
  const jobs = {
    jobs: [
      {
        name: 'Sync',
        status: 'in_progress',
        steps: [
          { name: 'Checkout', status: 'completed' },
          { name: 'Install dependencies', status: 'completed' },
          { name: 'Run sync Keep script', status: 'in_progress' },
          { name: 'Build pages', status: 'queued' },
        ],
      },
      {
        name: 'Publish',
        status: 'queued',
        steps: [
          { name: 'Deploy', status: 'queued' },
          { name: 'Verify deployment', status: 'queued' },
        ],
      },
    ],
  };

  const progress = workflowProgress(run, jobs);

  assert.equal(progress.phase, 'running');
  assert.equal(progress.percent, 38);
  assert.equal(progress.completedSteps, 2);
  assert.equal(progress.totalSteps, 6);
  assert.equal(progress.jobName, 'Sync');
  assert.equal(progress.stepName, 'Run sync Keep script');
});

test('marks a successful completed workflow as ready to refresh', async () => {
  const { workflowProgress, shouldRefreshAfterSync } = await import(modulePath);
  const progress = workflowProgress({
    id: 43,
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/MurphyKwok/keep_running/actions/runs/43',
  });

  assert.equal(progress.phase, 'success');
  assert.equal(progress.percent, 100);
  assert.equal(shouldRefreshAfterSync(progress), true);
});

test('never refreshes the page after a failed workflow', async () => {
  const { workflowProgress, shouldRefreshAfterSync } = await import(modulePath);
  const progress = workflowProgress({
    id: 44,
    status: 'completed',
    conclusion: 'failure',
    html_url: 'https://github.com/MurphyKwok/keep_running/actions/runs/44',
  });

  assert.equal(progress.phase, 'failed');
  assert.equal(progress.percent, 100);
  assert.equal(shouldRefreshAfterSync(progress), false);
});

test('shows the sync control only inside the Android WebView', async () => {
  const { isAndroidApp } = await import(modulePath);

  assert.equal(
    isAndroidApp('Mozilla/5.0 Android 15 KeepRunningAndroid/1.0.0'),
    true
  );
  assert.equal(isAndroidApp('Mozilla/5.0 Chrome/140'), false);
});

test('turns a network failure into an actionable message for the APK user', async () => {
  const { formatSyncError } = await import(modulePath);

  assert.equal(
    formatSyncError(new TypeError('Failed to fetch')),
    '无法连接 GitHub，请检查网络后重试。'
  );
});
