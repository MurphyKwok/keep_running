package io.github.murphykwok.keeprunning;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NavigationPolicyTest {
    @Test
    public void allowsThePublishedRunningPage() {
        assertTrue(NavigationPolicy.isRunningPage("https://murphykwok.github.io/keep_running/"));
        assertTrue(NavigationPolicy.isRunningPage("https://murphykwok.github.io/keep_running"));
    }

    @Test
    public void allowsTheBundledSnapshot() {
        assertTrue(NavigationPolicy.isLocalSnapshot(
            "https://appassets.androidplatform.net/assets/public/"
        ));
    }

    @Test
    public void opensExternalWebLinksOutsideTheApp() {
        assertTrue(NavigationPolicy.isExternalWeb("https://github.com/MurphyKwok/keep_running"));
        assertTrue(NavigationPolicy.isExternalWeb("https://example.com/article"));
        assertFalse(NavigationPolicy.isExternalWeb("http://murphykwok.github.io/keep_running/"));
    }

    @Test
    public void rejectsUnsupportedAndLookalikeUrls() {
        assertFalse(NavigationPolicy.isExternalWeb("javascript:alert(1)"));
        assertFalse(NavigationPolicy.isExternalWeb("intent://example.com"));
        assertFalse(NavigationPolicy.isRunningPage(
            "https://murphykwok.github.io.evil.example/keep_running/"
        ));
        assertFalse(NavigationPolicy.isRunningPage("http://murphykwok.github.io/keep_running/"));
    }
}
