package dev.pages.ai_syed_jalal_live.twa;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.browser.customtabs.CustomTabsClient;

import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

import java.util.Collections;

/**
 * Use a real Custom Tabs provider or explain why the app cannot open.
 *
 * Android can report a generic ACTION_VIEW handler which is not a functional
 * browser (for example an emulator's WebView test shell). Passing the URL to
 * that handler may show an unrelated screen instead of the website. This
 * fallback requires a Custom Tabs provider; it does not try to silently open
 * an arbitrary URL handler or bypass Android's security prompts.
 */
public class SafeLauncherActivity extends LauncherActivity {
    private static final String TAG = "SafeLauncherActivity";
    private static final String TRUSTED_HOST = "ai-syed-jalal-live.pages.dev";
    private boolean browserDialogShown;

    @Override
    protected Uri getUrlForIntent(Intent intent) {
        Uri uri = super.getUrlForIntent(intent);
        if (uri == null) return null;
        // Explicit intents can bypass the manifest's host filter. Do not let
        // another app open an unrelated origin inside this app's browser task.
        if ("https".equalsIgnoreCase(uri.getScheme())
                && TRUSTED_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443)) {
            return uri;
        }
        Log.w(TAG, "Ignoring an external or unsupported launch URL");
        return null; // Browser Helper uses the configured homepage instead.
    }

    @Override
    protected TwaLauncher.FallbackStrategy getFallbackStrategy() {
        return (context, builder, suggestedProvider, completionCallback) -> {
            // The system's default VIEW handler can be its chooser rather than
            // a browser (for example when Chrome and a WebView test shell are
            // both installed). Keep the Browser Helper's suggested provider
            // as a candidate, but let AndroidX verify it has a Custom Tabs
            // service. Passing null here discarded a working Chrome on API 26.
            String provider = CustomTabsClient.getPackageName(context,
                    suggestedProvider == null ? Collections.emptyList()
                            : Collections.singletonList(suggestedProvider));
            if (provider == null) {
                showBrowserNeeded();
                return;
            }
            try {
                TwaLauncher.CCT_FALLBACK_STRATEGY.launch(
                        context, builder, provider, completionCallback);
            } catch (RuntimeException error) {
                // A browser can be removed, disabled, or blocked after it was
                // resolved. Do not leave the user on a transparent screen.
                Log.w(TAG, "Unable to open a compatible browser", error);
                showBrowserNeeded();
            }
        };
    }

    private void showBrowserNeeded() {
        if (browserDialogShown || isFinishing() || isDestroyed()) return;
        browserDialogShown = true;
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(R.string.provider_unavailable_title)
                .setMessage(R.string.provider_unavailable_fallback_message)
                .setPositiveButton(android.R.string.ok, (dialog, which) -> dialog.dismiss())
                .setOnDismissListener(dialog -> finish())
                .show();
    }
}
