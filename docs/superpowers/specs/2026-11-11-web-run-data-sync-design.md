# Running Page Web Run Data Sync Design

## Goal

Expose the existing **Run Data Sync** workflow control on the public Running Page as well as inside the Android APK, so the owner can start and monitor a Keep data refresh without opening GitHub Actions.

## Access Model

The static GitHub Pages site cannot safely store a repository secret. Every visitor who uses the control supplies a fine-grained GitHub token scoped to `MurphyKwok/keep_running` with **Actions: Read and write** permission. The token is stored only in that visitor's browser or APK local storage and is sent only to `api.github.com`.

## User Experience

The control appears beside the site avatar on every supported client. A browser identifies itself as `Web`; an APK shows its installed version. On first use, the connection dialog explains the required token permissions. During a run, the panel shows queued/running/completed state, GitHub job and step progress, polling attempts, and a link to the run. A successful run reloads the page after the GitHub Pages deployment finishes. Failures remain visible and offer a retry action.

## Data Flow

1. Read the latest dispatch run ID from `run_data_sync.yml` as a baseline.
2. Dispatch the workflow on `main`.
3. Poll the workflow-specific runs endpoint every five seconds with a unique cache-busting URL. The website does not send `Cache-Control` or `Pragma` because GitHub CORS does not allow those headers.
4. Select the newest `workflow_dispatch` run with an ID greater than the baseline.
5. Read that run and its jobs, render progress, and refresh after success.

## Security and Failure Handling

The page never embeds a GitHub token or repository secret. Invalid, expired, or under-scoped tokens produce actionable messages. Legacy sessions without a usable run or baseline ID are discarded. Polling errors are surfaced and retried instead of silently freezing the progress indicator.

## Verification

Unit tests cover browser and APK client detection, token-gated visibility, deterministic run discovery, cache-busting request shape, progress calculation, completion refresh, and failure messages. Production builds and responsive browser checks verify that the control and dialogs remain usable on desktop and mobile layouts.
