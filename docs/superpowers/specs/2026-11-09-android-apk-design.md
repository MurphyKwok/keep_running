# MurphyKwok Running Page Android APK Design

## Goal

Provide an installable Android APK for the existing MurphyKwok Running Page. The APK loads the published page so it follows normal Keep data synchronization, and falls back to an APK-bundled snapshot when the network or GitHub Pages is unavailable.

## User-approved behavior

- Online data is preferred. The app opens `https://murphykwok.github.io/keep_running/` using a fresh network load.
- The current web build and activity data are bundled as an offline fallback.
- The offline fallback may lack vector map tiles because the basemap is hosted by OpenFreeMap. Statistics and stored track data remain available.
- Links to external sites open in the user's normal browser. Only the Running Page host stays inside the app.
- The Android back action returns through the WebView history before exiting the app.

## Architecture

The APK is a small native Java WebView shell under `android/`. It contains no separate copy of the Keep synchronization code. The same React/Vite application is built twice for its two hosting targets:

- GitHub Pages continues to build with its repository path prefix.
- The APK build uses `/assets/public/` and is served by `WebViewAssetLoader` at `https://appassets.androidplatform.net/assets/public/index.html`.

This asset-loader URL gives the local bundle an HTTPS origin and a normal path, so the existing browser router works without maintaining a separate application implementation or changing the website to hash routing.

## Components

### Android application

- Package: `io.github.murphykwok.keeprunning`
- Display name: `MurphyKwok 跑步数据`
- Minimum Android version: API 23
- Compile and target version: API 35
- Main activity: configures a JavaScript-enabled WebView, persistent DOM storage, HTTPS-only network security, safe browsing where available, and an app-version user-agent suffix.
- Navigation policy: allows the Running Page host and local asset host, opens other HTTP(S) links externally, and blocks unsupported schemes.
- Connection handling: checks for a network before requesting the online page and immediately opens the local snapshot when offline. A main-frame load error also switches to the snapshot once and shows a short message.
- Presentation: dark status and navigation bars, system-bar insets, launcher icon derived from the existing favicon, and a native loading overlay until the first page finishes loading.

### Snapshot build

A Node script builds the existing Vite application with `PATH_PREFIX=/assets/public/`, clears the Android `assets/public` destination, and copies the generated `dist` tree there. The script exposes a deterministic copy function for tests and a CLI entry point for local and CI use.

### Build automation

A GitHub Actions workflow installs Node 20, uses pnpm, prepares the snapshot, installs Java 17 and Gradle, runs Android unit tests, builds the debug APK, and uploads `keep-running-debug.apk` as a workflow artifact. The workflow supports manual dispatch and `apk-v*` tags.

## Data flow

1. The app starts and checks network availability.
2. With a network, it loads GitHub Pages with a no-cache request. That page consumes the same `activities.json` produced by the existing Keep workflows.
3. On no network or a main-frame loading error, the app loads the snapshot built from the same repository revision.
4. The snapshot includes compiled JavaScript, SVG assets, and the current activity data. OpenFreeMap tiles remain network resources.
5. A rebuild is required only for a new fallback snapshot or native behavior change. Normal data updates are visible immediately through the online page.

## Error handling and security

- Never bypass TLS certificate errors.
- Disable file and content access at the WebView level. Local files are served only through `WebViewAssetLoader`.
- Do not enable mixed HTTP content.
- Open external HTTPS/HTTP destinations outside the app.
- Show an offline fallback only once per activity session to avoid redirect loops.

## Testing

- Node tests verify snapshot replacement and stale-file removal using temporary directories.
- JVM unit tests verify Running Page, local asset, external HTTP, and blocked scheme URL classification.
- The Android build compiles in CI with API 35 and produces a debug APK.
- The generated APK is installed on an available emulator or device when possible. Otherwise installation is documented as the final manual gate while the APK build and package inspection are verified in CI.
- The existing web production build and Python test suites must continue to pass.

## Release constraint

The first artifact is a debug-signed APK intended for direct sideloading. A production Play Store release requires a persistent release keystore. Future APK updates should reuse the same signing key so Android can update the app in place.
