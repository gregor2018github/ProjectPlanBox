/** Starts the phone app's own backend (loaded only by the device build). */
import type { FetchFn } from "../../core/api/client";
import { startDeviceBackend } from "./bridge";
import { pageHost } from "./googleHost";

/** The API client's `fetch`, answered by the device backend. */
export function deviceFetch(): FetchFn {
  return startDeviceBackend(pageHost());
}
