package io.github.murphykwok.keeprunning;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

public final class NavigationPolicy {
    private static final String RUNNING_PAGE_HOST = "murphykwok.github.io";
    private static final String RUNNING_PAGE_PATH = "/keep_running";
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String LOCAL_PATH = "/assets/";

    private NavigationPolicy() {
    }

    public static boolean isRunningPage(String url) {
        URI uri = parse(url);
        return uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && RUNNING_PAGE_HOST.equalsIgnoreCase(uri.getHost())
            && pathStartsWith(uri, RUNNING_PAGE_PATH);
    }

    public static boolean isLocalSnapshot(String url) {
        URI uri = parse(url);
        return uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && LOCAL_HOST.equalsIgnoreCase(uri.getHost())
            && pathStartsWith(uri, LOCAL_PATH);
    }

    public static boolean isExternalWeb(String url) {
        URI uri = parse(url);
        if (uri == null) {
            return false;
        }
        String scheme = uri.getScheme() == null
            ? ""
            : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null
            ? ""
            : uri.getHost().toLowerCase(Locale.ROOT);
        if (!("http".equals(scheme) || "https".equals(scheme))) {
            return false;
        }
        return !RUNNING_PAGE_HOST.equals(host) && !LOCAL_HOST.equals(host);
    }

    private static boolean pathStartsWith(URI uri, String prefix) {
        String path = uri.getPath();
        if (path == null) {
            return false;
        }
        if (path.equals(prefix)) {
            return true;
        }
        return path.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
    }

    private static URI parse(String url) {
        if (url == null) {
            return null;
        }
        try {
            return new URI(url);
        } catch (URISyntaxException exception) {
            return null;
        }
    }
}
