import { Link } from "@tanstack/react-router";

/** Shown for any URL no route claims. */
export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 pt-10 md:px-6 md:pt-16">
      <h1 className="text-xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-base text-text-muted">
        This page does not exist.{" "}
        <Link to="/" className="text-accent underline-offset-2 hover:underline">
          Go home
        </Link>
      </p>
    </div>
  );
}
