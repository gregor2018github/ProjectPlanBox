package app.planbox;

import android.app.Activity;
import android.app.PendingIntent;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import org.json.JSONObject;

import java.util.Collections;

/**
 * Google sign-in for Drive sync: an access token for Drive's app data folder
 * (the hidden folder only PlanBox sees), from Google Play services'
 * AuthorizationClient. No password or token is stored by PlanBox; Play
 * services keeps the grant and hands out fresh tokens.
 *
 * The app's package name and signing certificate must be registered as an
 * OAuth client of type "Android" in the owner's Google Cloud project
 * (README, "Phone app").
 */
@CapacitorPlugin(name = "PlanBoxGoogle")
public class PlanBoxGooglePlugin extends Plugin {

    private static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";

    private ActivityResultLauncher<IntentSenderRequest> consent;
    private PluginCall waiting;
    private String lastToken;

    @Override
    public void load() {
        // Registered while the activity is being created, as Android requires.
        consent = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onConsent
        );
    }

    private AuthorizationClient client() {
        return Identity.getAuthorizationClient(getActivity());
    }

    private static AuthorizationRequest request() {
        return AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_APPDATA)))
            .build();
    }

    /** An access token; with `interactive`, Google's consent screen may show first. */
    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        client()
            .authorize(request())
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(call, result.getAccessToken());
                    return;
                }
                if (!interactive) {
                    // Not allowed yet: the user has to connect from the Data page.
                    resolveToken(call, null);
                    return;
                }
                PendingIntent intent = result.getPendingIntent();
                if (intent == null) {
                    call.reject("Google sign-in could not start.");
                    return;
                }
                if (waiting != null) waiting.reject("Another sign-in started.");
                waiting = call;
                consent.launch(new IntentSenderRequest.Builder(intent.getIntentSender()).build());
            })
            .addOnFailureListener(error -> call.reject(describe(error), error));
    }

    private void onConsent(ActivityResult result) {
        PluginCall call = waiting;
        waiting = null;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("Google sign-in was cancelled.");
            return;
        }
        try {
            AuthorizationResult granted = client().getAuthorizationResultFromIntent(result.getData());
            resolveToken(call, granted.getAccessToken());
        } catch (ApiException error) {
            call.reject(describe(error), error);
        }
    }

    private void resolveToken(PluginCall call, String token) {
        if (token != null) lastToken = token;
        JSObject answer = new JSObject();
        answer.put("accessToken", token == null ? JSONObject.NULL : token);
        call.resolve(answer);
    }

    /** Forgets a token Google rejected, so the next authorize() gets a fresh one. */
    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.resolve();
            return;
        }
        client()
            .clearToken(ClearTokenRequest.builder().setToken(token).build())
            .addOnCompleteListener(task -> call.resolve());
    }

    /**
     * Forgets the current token. The grant itself stays with Google until the
     * owner removes PlanBox at myaccount.google.com/permissions.
     */
    @PluginMethod
    public void signOut(PluginCall call) {
        String token = lastToken;
        lastToken = null;
        if (token == null) {
            call.resolve();
            return;
        }
        client()
            .clearToken(ClearTokenRequest.builder().setToken(token).build())
            .addOnCompleteListener(task -> call.resolve());
    }

    private static String describe(Exception error) {
        if (error instanceof ApiException) {
            int code = ((ApiException) error).getStatusCode();
            if (code == 10) {
                return "Google refused this app (developer error 10): register the app's package "
                    + "name and SHA-1 as an Android OAuth client (README, \"Phone app\").";
            }
            return "Google sign-in failed (code " + code + "): " + error.getMessage();
        }
        return "Google sign-in failed: " + error.getMessage();
    }
}
