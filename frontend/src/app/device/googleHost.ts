/**
 * Google sign-in for Drive sync in the Android app, through the app's own
 * Capacitor plugin (`PlanBoxGooglePlugin.java`, Google Play services'
 * AuthorizationClient). In a plain browser there is no plugin, and sync is
 * unavailable.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

import type { DeviceHostPage } from "./bridge";

interface PlanBoxGooglePlugin {
  /** An access token for the app data folder; `interactive` may show Google's consent. */
  authorize(options: { interactive: boolean }): Promise<{ accessToken: string | null }>;
  /** Forgets a token Google rejected, so the next one is fresh. */
  clearToken(options: { token: string }): Promise<void>;
  /** Withdraws the app's access to Drive. */
  signOut(): Promise<void>;
}

const plugin = registerPlugin<PlanBoxGooglePlugin>("PlanBoxGoogle");

/** The page's host for the device backend. */
export function pageHost(): DeviceHostPage {
  const available = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PlanBoxGoogle");
  return {
    cloudAvailable: available,
    deviceName: available ? "Android phone" : "Browser",
    googleToken: async (interactive) => {
      if (!available) return null;
      return (await plugin.authorize({ interactive })).accessToken;
    },
    dropGoogleToken: async (token) => {
      if (available) await plugin.clearToken({ token });
    },
    signOutGoogle: async () => {
      if (available) await plugin.signOut();
    },
  };
}
