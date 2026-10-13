import { Smartphone } from "lucide-react";
import { useState, type SyntheticEvent } from "react";

import { useSignIn } from "../core/auth/authQueries";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

/** Shown on a phone that has not paired yet: asks for the code the PC shows. */
export function SignInScreen() {
  const signIn = useSignIn();
  const [code, setCode] = useState("");

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (code.trim() !== "") signIn.mutate(code);
  };

  return (
    <div className="flex h-full items-center justify-center bg-bg px-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col items-center gap-3 text-center"
      >
        <Smartphone size={28} strokeWidth={1.75} aria-hidden className="text-text-muted" />
        <h1 className="text-xl font-semibold tracking-tight">Pair this device</h1>
        <p className="text-base text-text-muted">
          On the PC running PlanBox, open <strong className="font-medium text-text">Data</strong>{" "}
          and choose <strong className="font-medium text-text">Pair a phone</strong>. Type the code
          it shows.
        </p>
        <Input
          aria-label="Pairing code"
          placeholder="ABCD-EFGH"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
          className="text-center font-mono tracking-widest"
        />
        {signIn.error && (
          <p role="alert" className="text-sm text-danger">
            {signIn.error.message}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={signIn.isPending} className="w-full">
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
