# Running Page Web Run Data Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing Run Data Sync control to normal website visitors while retaining the APK behavior and token-local storage.

**Architecture:** A shared client resolver distinguishes website and APK labels. The existing React component owns token entry, dispatch, polling, progress, errors, and completion refresh for both surfaces.

**Tech Stack:** React, TypeScript, Vite, Node test runner, GitHub Actions REST API, GitHub Pages.

## Global Constraints

- The website must not bundle or commit a GitHub token.
- A token must be limited to `MurphyKwok/keep_running` with Actions read and write permission.
- Tokens remain in client-local storage only.
- Website and APK must use the same run discovery and progress logic.
- GitHub runs API requests must bypass cached responses.

---

### Task 1: Enable the shared control for websites and APKs

**Files:**

- Modify: `src/utils/workflowSync.mjs`
- Modify: `src/utils/workflowSync.d.mts`
- Modify: `src/components/RunDataSync/index.tsx`
- Test: `tests/frontend/workflow-sync.test.cjs`

**Interfaces:**

- Produces: `resolveSyncClient(userAgent: string): { kind: 'web' | 'android'; label: string; appVersion: string }`

- [x] **Step 1: Write the failing client-resolution test**

```js
assert.deepEqual(resolveSyncClient('Mozilla/5.0 Chrome/140'), {
  kind: 'web',
  label: 'Web',
  appVersion: '',
});
```

- [x] **Step 2: Run the test and verify the missing-function failure**

Run: `npm run test:frontend`

- [x] **Step 3: Implement the resolver and render the control for every supported client**

```js
const [syncClient] = useState(() => resolveSyncClient(navigator.userAgent));
```

- [x] **Step 4: Run the frontend tests**

Run: `npm run test:frontend`

- [x] **Step 5: Commit the implementation**

```bash
git add src tests/frontend/workflow-sync.test.cjs
git commit -m "feat: add Run Data Sync to the website"
```

### Task 2: Verify build and responsive behavior

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: the shared `RunDataSync` component from Task 1.

- [x] **Step 1: Build the production website**

Run: `npm run build`

- [x] **Step 2: Verify desktop and mobile rendering**

Open the built page locally, confirm the avatar-adjacent button is visible, open its token dialog at desktop width, and repeat at 390 by 844 pixels.

- [x] **Step 3: Run Android snapshot validation**

Run: `npm run test:android`

- [x] **Step 4: Document the website token flow**

Update `README.md` to describe browser-local token storage and the shared APK behavior.

- [x] **Step 5: Publish through GitHub Pages**

Push the verified change to `main` and trigger the `Publish GitHub Pages` workflow after the page deployment is available.
