package app.planbox;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/** The PlanBox app: the web app in a WebView, plus PlanBox's own Google sign-in plugin. */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlanBoxGooglePlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new BackGesture());
    }

    /**
     * The back gesture (edge swipe or back button): the page closes an open
     * menu, dialog or pane first (frontend/src/core/back.ts), else the
     * WebView goes back a page, else Android's default (leave the app).
     */
    private final class BackGesture extends OnBackPressedCallback {

        BackGesture() {
            super(true);
        }

        @Override
        public void handleOnBackPressed() {
            WebView webView = getBridge().getWebView();
            webView.evaluateJavascript(
                "window.planboxBack ? window.planboxBack() : false",
                handled -> {
                    if ("true".equals(handled)) return;
                    if (webView.canGoBack()) {
                        webView.goBack();
                        return;
                    }
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            );
        }
    }
}
