# MurphyKwok Running Page Android APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build and verify an Android WebView APK that loads the latest Running Page online and falls back to a bundled snapshot offline.

**Architecture:** A Java WebView application serves the Vite snapshot through `WebViewAssetLoader`, prefers the published GitHub Pages URL, and uses a pure navigation-policy class plus a Node snapshot helper so both critical behaviors are testable.

**Tech Stack:** Android Java, Gradle, AndroidX WebKit, Node.js, Vite, GitHub Actions

## Global Constraints

- Package name is exactly `io.github.murphykwok.keeprunning`.
- App label is exactly `MurphyKwok 跑步数据`.
- Minimum Android API is 23; compile and target SDK are 35.
- Online URL is exactly `https://murphykwok.github.io/keep_running/`.
- Local snapshot URL is exactly `https://appassets.androidplatform.net/assets/public/`.
- Cleartext network traffic and TLS certificate bypass are prohibited.
- Existing Keep data remains the single source of truth; do not duplicate or modify activity generation.

---

### Task 1: Snapshot builder and its tests

**Files:**
- Create: `scripts/build-android-snapshot.mjs`
- Create: `tests/android/snapshot.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `buildSnapshot({ projectRoot, targetDir }) -> void`
- Produces: `copySnapshot(sourceDir, targetDir) -> void`
- Produces npm scripts `android:prepare` and `test:android`.

- [x] **Step 1: Write the failing snapshot test**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { copySnapshot } = await import('../../scripts/build-android-snapshot.mjs');

test('replaces the Android snapshot without stale assets', () => {
  // Create temporary source and target directories with an obsolete target file.
  // Copy the source, then assert the new file exists and the obsolete file does not.
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `node --test tests/android/snapshot.test.cjs`

Expected: FAIL because `scripts/build-android-snapshot.mjs` does not exist.

- [x] **Step 3: Implement the snapshot helper**

The CLI runs the local Vite binary through the current Node executable with `PATH_PREFIX=/assets/public/`. `copySnapshot` removes the destination directory and recursively copies `dist` into `android/app/src/main/assets/public`.

- [x] **Step 4: Run the test and verify GREEN**

Run: `node --test tests/android/snapshot.test.cjs`

Expected: PASS.

### Task 2: Navigation policy and JVM tests

**Files:**
- Create: `android/settings.gradle`
- Create: `android/build.gradle`
- Create: `android/app/build.gradle`
- Create: `android/gradle.properties`
- Create: `android/app/src/main/java/io/github/murphykwok/keeprunning/NavigationPolicy.java`
- Create: `android/app/src/test/java/io/github/murphykwok/keeprunning/NavigationPolicyTest.java`

**Interfaces:**
- Produces: `NavigationPolicy.isRunningPage(String url) -> boolean`
- Produces: `NavigationPolicy.isLocalSnapshot(String url) -> boolean`
- Produces: `NavigationPolicy.isExternalWeb(String url) -> boolean`

- [x] **Step 1: Write failing JVM tests**

Create the minimal Gradle configuration first so the test task can run. It should use application ID `io.github.murphykwok.keeprunning`, version code 1, version name `1.0.0`, AGP 8.7.3, JUnit 4, and API 35.

```java
assertTrue(NavigationPolicy.isRunningPage("https://murphykwok.github.io/keep_running/"));
assertTrue(NavigationPolicy.isLocalSnapshot("https://appassets.androidplatform.net/assets/public/"));
assertTrue(NavigationPolicy.isExternalWeb("https://github.com/MurphyKwok/keep_running"));
assertFalse(NavigationPolicy.isExternalWeb("javascript:alert(1)"));
assertFalse(NavigationPolicy.isExternalWeb("http://murphykwok.github.io/keep_running/"));
```

- [x] **Step 2: Run the tests and verify RED**

Run: `gradle -p android testDebugUnitTest`

Expected: FAIL because `NavigationPolicy` does not exist and the Android project is not yet scaffolded.

- [x] **Step 3: Implement policy using `java.net.URI`**

Allow only HTTPS for the exact Running Page origin and required path prefix. Treat HTTP and HTTPS as external browser links, and reject all other schemes.

- [x] **Step 4: Run the tests and verify GREEN**

Run: `gradle -p android testDebugUnitTest`

Expected: BUILD SUCCESSFUL.

### Task 3: Android WebView application

**Files:**
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/res/values/colors.xml`
- Create: `android/app/src/main/res/values/styles.xml`
- Create: `android/app/src/main/res/xml/network_security_config.xml`
- Create: `android/app/src/main/res/mipmap-*/ic_launcher.png`
- Create: `android/app/src/main/java/io/github/murphykwok/keeprunning/MainActivity.java`

**Interfaces:**
- Consumes: `NavigationPolicy` from Task 2.
- Consumes: `assets/public/index.html` from Task 1.
- Produces: installable debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`.

- [x] **Step 1: Add the WebKit dependency and application resources**

Add `androidx.webkit:webkit:1.12.1` to serve the local snapshot through an HTTPS asset origin. Add the manifest, app name, themes, network security configuration, and launcher icon.

- [x] **Step 2: Implement the WebView activity**

Configure JavaScript, DOM storage, no mixed content, no file/content access, TLS-error cancellation, network detection, online no-cache loading, one-time offline fallback, external-link handling, back navigation, system-bar insets, and a native loading overlay. Serve `/assets/public/` as `assets/public/index.html` so the browser router receives the expected base path.

- [x] **Step 3: Add the dark app theme and launcher icon**

Use `#10110F` for system surfaces and `#D9F42B` for the accent. Generate launcher densities from `public/images/favicon.png`.

- [x] **Step 4: Run Android unit tests and assemble the APK**

Run: `node scripts/build-android-snapshot.mjs && gradle -p android testDebugUnitTest assembleDebug`

Expected: tests pass and `app-debug.apk` exists.

### Task 4: GitHub Actions build and documentation

**Files:**
- Create: `.github/workflows/android-apk.yml`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces workflow artifact `keep-running-debug-apk` containing `app-debug.apk`.

- [x] **Step 1: Add the APK workflow**

Support `workflow_dispatch` and `apk-v*` tags. Check out the repository, install Node 20 and pnpm, prepare the snapshot, install Temurin Java 17, set up Gradle, run `testDebugUnitTest assembleDebug`, and upload the APK artifact.

- [x] **Step 2: Document local building and installation**

Document the online-first/offline-fallback behavior, the snapshots' map-tile limitation, local build commands, GitHub Actions artifact, and debug-signing update limitation.

- [x] **Step 3: Ignore generated Android and snapshot files**

Ignore `android/.gradle/`, `android/**/build/`, and `android/app/src/main/assets/public/`.

- [x] **Step 4: Validate repository checks**

Run: `node --test tests/android/snapshot.test.cjs tests/miniprogram/coords.test.cjs`

Run: `PATH_PREFIX=/keep_running ./node_modules/.bin/vite build`

Run: `PYTHONPATH=run_page /tmp/keep-running-venv/bin/python -m unittest discover -s run_page/tests -v`

Expected: all commands pass.

### Task 5: Produce and inspect the APK

**Files:**
- Generated: `android/app/build/outputs/apk/debug/app-debug.apk`

**Interfaces:**
- Produces a downloadable APK artifact for the user.

- [x] **Step 1: Run the APK workflow**

Push the implementation and run `.github/workflows/android-apk.yml` through its `apk-v1.0.0` tag or manual dispatch.

- [x] **Step 2: Verify the workflow build**

Expected: `testDebugUnitTest` and `assembleDebug` succeed, and `keep-running-debug-apk` is uploaded.

- [x] **Step 3: Download and inspect the APK**

Run: `unzip -l app-debug.apk | rg 'classes.dex|AndroidManifest.xml|assets/public/index.html'`

Expected: all three required members exist.

- [ ] **Step 4: Install on an emulator or device when an Android runtime is available**

Run: `/Volumes/Storage/Downloads/ADB/platform-tools/adb install -r app-debug.apk`

Expected: `Success`. If no device is connected, report this as the only remaining device-level check.
