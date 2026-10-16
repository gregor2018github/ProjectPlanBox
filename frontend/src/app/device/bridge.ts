/**
 * The page's side of the phone app's backend: starts the worker, and gives
 * the API client a `fetch` that is answered by it instead of the network.
 * Google sign-in runs here, on the page, because the Android plugin is only
 * reachable from it.
 */
import type { FetchFn } from "../../core/api/client";
import type { DeviceRequest, FromWorker, HostCall, ToWorker } from "./protocol";

/** What the page offers the worker. */
export interface DeviceHostPage {
  cloudAvailable: boolean;
  deviceName: string;
  googleToken(interactive: boolean): Promise<string | null>;
  dropGoogleToken(token: string): Promise<void>;
  signOutGoogle(): Promise<void>;
}

/** Starts the device backend; returns the `fetch` for the API client. */
export function startDeviceBackend(host: DeviceHostPage): FetchFn {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (response: Response) => void>();
  let nextId = 1;
  const send = (message: ToWorker) => {
    worker.postMessage(message);
  };

  const answerHost = async (call: HostCall) => {
    try {
      let value: string | null = null;
      if (call.name === "googleToken") value = await host.googleToken(call.args[0] === true);
      else if (call.name === "dropGoogleToken") await host.dropGoogleToken(String(call.args[0]));
      else await host.signOutGoogle();
      send({ type: "host-reply", id: call.id, ok: true, value });
    } catch (error) {
      send({
        type: "host-reply",
        id: call.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    if (message.type === "response") {
      pending.get(message.id)?.(
        new Response(message.body, { status: message.status, headers: message.headers }),
      );
      pending.delete(message.id);
    } else if (message.type === "host-call") {
      void answerHost(message);
    } else if (message.type === "failed") {
      // Requests made so far would wait forever: answer them with the reason.
      for (const [id, resolve] of pending) {
        resolve(
          new Response(
            JSON.stringify({
              type: "about:blank",
              title: "Database unavailable",
              status: 503,
              detail: `PlanBox could not open its database: ${message.message ?? "unknown error"}`,
              code: "device_unavailable",
            }),
            { status: 503, headers: { "Content-Type": "application/problem+json" } },
          ),
        );
        pending.delete(id);
      }
    }
  };
  send({ type: "start", cloudAvailable: host.cloudAvailable, deviceName: host.deviceName });

  return async (request: Request) => {
    const id = nextId;
    nextId += 1;
    const body =
      request.method === "GET" || request.method === "HEAD" ? null : await request.text();
    const message: DeviceRequest = {
      type: "request",
      id,
      method: request.method,
      url: request.url,
      headers: [...request.headers.entries()],
      body: body === "" ? null : body,
    };
    return new Promise<Response>((resolve) => {
      pending.set(id, resolve);
      send(message);
    });
  };
}
