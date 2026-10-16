package app.planbox;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/** The PlanBox app: the web app in a WebView, plus PlanBox's own Google sign-in plugin. */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlanBoxGooglePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
