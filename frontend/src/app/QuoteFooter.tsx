import { useState } from "react";

import { quoteForThisStart } from "./quotes";

/** The strip under every view with one historical quotation, new on each start. */
export function QuoteFooter() {
  const [quote] = useState(quoteForThisStart);
  return (
    <footer className="shrink-0 border-t border-border px-4 py-2 text-center text-sm text-text-muted">
      <figure>
        <blockquote lang={quote.lang} className="inline italic">
          {quote.text}
        </blockquote>
        <figcaption className="inline text-text-subtle">
          {" — "}
          {quote.author}
          {", "}
          {quote.source}
        </figcaption>
      </figure>
    </footer>
  );
}
