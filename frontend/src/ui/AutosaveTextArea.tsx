import { useEffect, useRef, useState } from "react";

import { TextArea, type TextAreaProps } from "./TextArea";

/** Props for {@link AutosaveTextArea}. */
export interface AutosaveTextAreaProps extends Omit<
  TextAreaProps,
  "value" | "onChange" | "onFocus" | "onBlur"
> {
  value: string;
  /** Called with the text after a pause in typing, and on blur, when it changed. */
  onSave: (value: string) => void;
  /** Pause before saving, in ms. */
  delay?: number;
}

/**
 * A text area that saves itself: after a short pause and when it loses
 * focus. It follows outside changes to `value` while not focused.
 */
export function AutosaveTextArea({ value, onSave, delay = 600, ...props }: AutosaveTextAreaProps) {
  const [draft, setDraft] = useState(value);
  const [source, setSource] = useState(value);
  const [focused, setFocused] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  if (value !== source && !focused) {
    setSource(value);
    setDraft(value);
  }

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const save = (text: string) => {
    window.clearTimeout(timer.current);
    if (text !== value) onSave(text);
  };

  return (
    <TextArea
      {...props}
      value={draft}
      onFocus={() => {
        setFocused(true);
      }}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          save(text);
        }, delay);
      }}
      onBlur={() => {
        setFocused(false);
        save(draft);
      }}
    />
  );
}
