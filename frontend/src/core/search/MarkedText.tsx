import { splitMarks } from "./marks";

/** Props for {@link MarkedText}. */
export interface MarkedTextProps {
  /** Text with the server's match marks. */
  text: string;
}

/** Renders a search title or snippet with its matched terms emphasised. */
export function MarkedText({ text }: MarkedTextProps) {
  return (
    <>
      {splitMarks(text).map((part, index) =>
        part.match ? (
          <mark key={index} className="bg-transparent font-semibold text-text">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
