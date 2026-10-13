import { useMeta } from "../api/coreQueries";
import { formatInstant } from "../data/format";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/useToast";
import {
  usePhoneAccess,
  useSession,
  useSignOut,
  useSignOutEverywhere,
  useStartPairing,
} from "./authQueries";

/**
 * The Data page's phone block. On the PC: whether phone access is on, the
 * address to open, and pairing. On a phone: that it is signed in.
 */
export function PhoneAccessSection() {
  const session = useSession();
  const local = session.data?.local ?? true;
  const access = usePhoneAccess(local);
  const pairing = useStartPairing();
  const signOutAll = useSignOutEverywhere();
  const signOut = useSignOut();
  const timeZone = useMeta().data?.timezone ?? "UTC";
  const { show } = useToast();
  const data = access.data;

  const failed = (title: string) => (error: Error) => {
    show({ title, description: error.message, tone: "error" });
  };

  return (
    <section aria-labelledby="data-phones" className="flex flex-col gap-4">
      <header>
        <h2 id="data-phones" className="text-lg font-semibold tracking-tight">
          Phones
        </h2>
        <p className="text-sm text-text-muted">
          Use PlanBox from your phone while this PC runs it, on the same Wi-Fi or over Tailscale.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-lg bg-surface p-4 text-sm">
        {!local ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>This device is signed in.</p>
            <Button
              variant="secondary"
              onClick={() => {
                signOut.mutate(undefined, { onError: failed("Could not sign out") });
              }}
            >
              Sign out
            </Button>
          </div>
        ) : data === undefined ? null : !data.enabled ? (
          <p className="text-text-muted">
            Off. To turn it on, add <code className="font-mono">network = true</code> to{" "}
            <code className="font-mono">private_data/settings.toml</code> and restart PlanBox.
            Windows then asks once whether Python may accept connections on private networks.
          </p>
        ) : (
          <>
            <div>
              <h3 className="text-base font-semibold">Open on the phone</h3>
              <ul aria-label="Phone addresses">
                {data.urls.map((url) => (
                  <li key={url} className="font-mono break-all">
                    {url}
                  </li>
                ))}
              </ul>
              {!data.tls && (
                <p className="mt-1 text-text-muted">
                  Plain http: the phone can add PlanBox to its home screen, but it cannot work
                  offline, and others on the same Wi-Fi could read the traffic. Set{" "}
                  <code className="font-mono">network_tls_cert</code> and{" "}
                  <code className="font-mono">network_tls_key</code> for https.
                </p>
              )}
            </div>
            {data.pairing === null ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={pairing.isPending}
                  onClick={() => {
                    pairing.mutate(undefined, { onError: failed("Could not start pairing") });
                  }}
                >
                  Pair a phone
                </Button>
                <Button
                  variant="secondary"
                  disabled={signOutAll.isPending}
                  onClick={() => {
                    signOutAll.mutate(undefined, {
                      onSuccess: () => {
                        show({ title: "Every phone is signed out" });
                      },
                      onError: failed("Could not sign the phones out"),
                    });
                  }}
                >
                  Sign out all phones
                </Button>
              </div>
            ) : (
              <div aria-live="polite">
                <p>Type this code on the phone:</p>
                <p className="font-mono text-2xl font-semibold tracking-widest">
                  {data.pairing.code}
                </p>
                <p className="text-text-muted">
                  Works once, until {formatInstant(data.pairing.expires_at, timeZone)}.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
