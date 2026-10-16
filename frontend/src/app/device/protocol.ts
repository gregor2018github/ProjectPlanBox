/** Messages between the page and the device backend's worker. */

/** Settings the page hands the worker when it starts. */
export interface DeviceStart {
  type: "start";
  /** Whether Google sign-in exists here (the Android app). */
  cloudAvailable: boolean;
  /** How this device is named in Google Drive sync. */
  deviceName: string;
}

/** An API request, as the page's `fetch` received it. */
export interface DeviceRequest {
  type: "request";
  id: number;
  method: string;
  url: string;
  headers: [string, string][];
  body: string | null;
}

/** The answer to a host call. */
export interface HostReply {
  type: "host-reply";
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** Page → worker. */
export type ToWorker = DeviceStart | DeviceRequest | HostReply;

/** The answer to an API request. */
export interface DeviceResponse {
  type: "response";
  id: number;
  status: number;
  headers: [string, string][];
  body: string;
}

/** The worker asks the page for something only the page can do (Google sign-in). */
export interface HostCall {
  type: "host-call";
  id: number;
  name: "googleToken" | "dropGoogleToken" | "signOutGoogle";
  args: unknown[];
}

/** The backend is open, or failed to open. */
export interface DeviceState {
  type: "ready" | "failed";
  message?: string;
}

/** Worker → page. */
export type FromWorker = DeviceResponse | HostCall | DeviceState;
