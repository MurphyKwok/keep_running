import { type FormEvent, useEffect, useState } from 'react';
import {
  dispatchWorkflow,
  findDispatchedRun,
  formatSyncError,
  getLatestWorkflowDispatchRun,
  getWorkflowJobs,
  getWorkflowRun,
  isResumableSyncSession,
  resolveSyncClient,
  shouldRefreshAfterSync,
  workflowProgress,
} from '@/utils/workflowSync.mjs';

const TOKEN_STORAGE_KEY = 'keep_running:github_sync_token';
const SESSION_STORAGE_KEY = 'keep_running:github_sync_session';
const POLL_INTERVAL_MS = 5000;

interface SyncSession {
  requestedAt: string;
  baselineRunId?: number | null;
  runId: number | null;
}

interface SyncProgress {
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

const emptyProgress: SyncProgress = {
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

const stepLabels: Record<string, string> = {
  Checkout: '检出代码',
  'Set up Python': '配置 Python',
  'Install dependencies': '安装依赖',
  'Cache Data Files': '恢复同步数据',
  'Run sync Keep script': '从 Keep 同步跑步数据',
  'Make svg GitHub profile': '生成跑步数据图表',
  'Set Output': '准备发布参数',
  'Build and publish Github Pages': '发布 Running Page',
  'Setup Node.js environment': '配置 Node.js',
  'Enable corepack': '配置包管理器',
  'Get pnpm store directory': '读取依赖缓存目录',
  'Setup pnpm cache': '恢复网页构建缓存',
  Build: '构建网页',
  'Upload artifact': '上传网页构建结果',
  'Deploy to GitHub Pages': '部署 GitHub Pages',
};

function readStoredSession(): SyncSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SyncSession;
    return isResumableSyncSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStoredSession(session: SyncSession | null) {
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // The control still works for this page load if WebView storage is disabled.
  }
}

const RunDataSync = () => {
  const [syncClient] = useState(() => resolveSyncClient(navigator.userAgent));
  const [token, setToken] = useState(readStoredToken);
  const [session, setSession] = useState<SyncSession | null>(readStoredSession);
  const [progress, setProgress] = useState<SyncProgress>(emptyProgress);
  const [panelOpen, setPanelOpen] = useState(Boolean(session));
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(token);
  const [error, setError] = useState('');
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    if (!token || !session) {
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let currentRunId = session.runId;
    let discoveryAttempts = 0;

    const poll = async () => {
      try {
        let run;
        if (currentRunId) {
          run = await getWorkflowRun(token, currentRunId);
        } else {
          run = await findDispatchedRun(token, session.baselineRunId ?? 0);
          if (!run) {
            discoveryAttempts += 1;
            if (!disposed) {
              setProgress({
                ...emptyProgress,
                phase: 'queued',
                percent: 3,
                runStatus: 'queued',
                stepName: `已检查 ${discoveryAttempts} 次，等待 GitHub 创建任务（基准 #${session.baselineRunId ?? 0}）`,
              });
              setError('');
              timer = setTimeout(poll, POLL_INTERVAL_MS);
            }
            return;
          }
          currentRunId = run.id;
          const nextSession = { ...session, runId: run.id };
          setSession(nextSession);
          writeStoredSession(nextSession);
        }

        const [latestRun, jobs] = await Promise.all([
          currentRunId === run.id ? run : getWorkflowRun(token, currentRunId),
          getWorkflowJobs(token, currentRunId),
        ]);
        const nextProgress = workflowProgress(latestRun, jobs) as SyncProgress;
        if (!disposed) {
          setProgress(nextProgress);
          setError('');
          if (
            nextProgress.phase !== 'success' &&
            nextProgress.phase !== 'failed'
          ) {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      } catch (requestError) {
        if (!disposed) {
          setError(formatSyncError(requestError));
          setProgress((current) => ({
            ...current,
            phase: current.phase === 'idle' ? 'queued' : current.phase,
            percent: Math.max(current.percent, 3),
          }));
          timer = setTimeout(poll, POLL_INTERVAL_MS * 2);
        }
      }
    };

    poll();
    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [session?.baselineRunId, token]);

  useEffect(() => {
    if (!shouldRefreshAfterSync(progress)) {
      return;
    }
    writeStoredSession(null);
    const timer = setTimeout(() => {
      const next = new URL(window.location.href);
      next.searchParams.set('sync', String(Date.now()));
      window.location.replace(next.toString());
    }, 1200);
    return () => clearTimeout(timer);
  }, [progress]);

  const busy = progress.phase === 'queued' || progress.phase === 'running';
  const finished = progress.phase === 'success' || progress.phase === 'failed';
  const buttonLabel =
    progress.phase === 'queued'
      ? `排队 ${progress.percent}%`
      : progress.phase === 'running'
        ? `同步 ${progress.percent}%`
        : progress.phase === 'success'
          ? '同步完成'
          : progress.phase === 'failed'
            ? '同步失败'
            : 'Run Data Sync';

  const startSync = async (activeToken: string) => {
    setError('');
    setDispatching(true);
    setPanelOpen(true);
    setProgress({
      ...emptyProgress,
      phase: 'queued',
      percent: 2,
      runStatus: 'queued',
      stepName: '正在提交同步任务',
    });
    try {
      const latestRun = await getLatestWorkflowDispatchRun(activeToken);
      await dispatchWorkflow(activeToken);
      const nextSession = {
        requestedAt: new Date().toISOString(),
        baselineRunId: latestRun?.id ?? 0,
        runId: null,
      };
      setSession(nextSession);
      writeStoredSession(nextSession);
    } catch (requestError) {
      setProgress(emptyProgress);
      setError(formatSyncError(requestError));
    } finally {
      setDispatching(false);
    }
  };

  const handleButtonClick = () => {
    if (busy || finished) {
      setPanelOpen(true);
      return;
    }
    if (!token) {
      setTokenDraft('');
      setTokenDialogOpen(true);
      return;
    }
    setPanelOpen(true);
    startSync(token);
  };

  const saveTokenAndSync = (event: FormEvent) => {
    event.preventDefault();
    const nextToken = tokenDraft.trim();
    if (!nextToken) {
      setError('请输入 GitHub 访问令牌。');
      return;
    }
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    } catch {
      setError('无法在此设备保存令牌，请检查 WebView 存储设置。');
      return;
    }
    setToken(nextToken);
    setTokenDraft(nextToken);
    setTokenDialogOpen(false);
    startSync(nextToken);
  };

  const promptForNewToken = () => {
    setPanelOpen(false);
    setTokenDraft(token);
    setError('');
    setTokenDialogOpen(true);
  };

  const displayedStep = progress.stepName
    ? stepLabels[progress.stepName] ?? progress.stepName
    : progress.phase === 'idle'
      ? '等待开始'
      : '等待 GitHub 返回运行状态';

  return (
    <>
      <button
        type="button"
        aria-label="Run Data Sync"
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={handleButtonClick}
        disabled={dispatching}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:border-amber-400 hover:text-amber-300 disabled:cursor-wait disabled:opacity-70 sm:px-4"
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          {busy ? (
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          ) : (
            <path d="M20 7v5h-5M4 17v-5h5M6.1 9a7 7 0 0 1 11.8-2L20 12M4 12l2.1 5a7 7 0 0 0 11.8-2" />
          )}
        </svg>
        <span>{buttonLabel}</span>
      </button>

      {panelOpen && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="sync-panel-title"
          className="fixed left-4 right-4 top-28 z-40 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl sm:left-auto sm:w-96"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
                GitHub Actions · {syncClient.label}
              </p>
              <h2 id="sync-panel-title" className="mt-1 text-xl font-extrabold">
                Run Data Sync
              </h2>
            </div>
            <button
              type="button"
              aria-label="关闭同步进度"
              onClick={() => setPanelOpen(false)}
              className="rounded-full p-1 text-2xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ×
            </button>
          </div>

          <div className="mt-5" aria-live="polite">
            <div className="flex items-end justify-between gap-4">
              <p className="font-semibold">
                {progress.phase === 'queued' && '等待运行器'}
                {progress.phase === 'running' && '正在同步与发布'}
                {progress.phase === 'success' && '同步完成，正在刷新'}
                {progress.phase === 'failed' && '同步失败'}
                {progress.phase === 'idle' &&
                  (dispatching ? '正在启动' : '准备同步')}
              </p>
              <strong className="text-2xl tabular-nums text-amber-600">
                {progress.percent}%
              </strong>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progress.phase === 'failed' ? 'bg-red-500' : 'bg-amber-500'
                }`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-600">{displayedStep}</p>
            {progress.totalSteps > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                已完成 {progress.completedSteps}/{progress.totalSteps} 个步骤
              </p>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-4">
              {progress.runUrl ? (
                <a
                  href={progress.runUrl}
                  className="text-sm font-semibold text-amber-700 hover:underline"
                >
                  查看 GitHub 运行详情
                </a>
              ) : (
                <span className="text-xs text-slate-400">请保持网络连接</span>
              )}
              {progress.phase === 'failed' && token && (
                <button
                  type="button"
                  onClick={() => startSync(token)}
                  className="text-sm font-semibold text-slate-900 hover:text-amber-700"
                >
                  重新同步
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={promptForNewToken}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              更换访问令牌
            </button>
          </div>
        </section>
      )}

      {tokenDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={saveTokenAndSync}
            className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
              Run Data Sync
            </p>
            <h2 className="mt-2 text-2xl font-extrabold">连接 GitHub</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              首次使用需要你的 GitHub 细粒度访问令牌。令牌只保存在当前浏览器或
              APK 的本地存储中，不会写入仓库或公开页面。
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
              <li>创建仅授权 keep_running 仓库的细粒度令牌。</li>
              <li>将 Actions 权限设为 Read and write。</li>
              <li>把令牌粘贴到下方并开始同步。</li>
            </ol>
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              className="mt-3 inline-block text-sm font-semibold text-amber-700 hover:underline"
            >
              创建 GitHub 细粒度令牌
            </a>
            <label
              htmlFor="github-sync-token"
              className="mt-5 block text-sm font-semibold"
            >
              GitHub 访问令牌
            </label>
            <input
              id="github-sync-token"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              placeholder="github_pat_..."
              className="font-mono mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTokenDialogOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                保存并开始同步
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default RunDataSync;
