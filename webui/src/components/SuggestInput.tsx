import { forwardRef, useId, useLayoutEffect, useRef, useState } from "react";

export const SuggestInput = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    suggestions: string[];
    label: string;
    multiline?: boolean;
    invalid?: boolean;
    describedBy?: string;
    placeholder?: string;
  }
>(function SuggestInput(
  {
    value,
    onChange,
    onBlur,
    suggestions,
    label,
    multiline,
    invalid,
    describedBy,
    placeholder,
  },
  ref,
) {
  const id = useId();
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const pendingCursor = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (
      pendingCursor.current !== null &&
      document.activeElement === input.current
    ) {
      input.current?.setSelectionRange(
        pendingCursor.current,
        pendingCursor.current,
      );
      pendingCursor.current = null;
    }
  });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [cursor, setCursor] = useState(value.length);
  const lineStart =
    multiline && cursor > 0 ? value.lastIndexOf("\n", cursor - 1) + 1 : 0;
  const lineEnd = multiline ? value.indexOf("\n", cursor) : -1;
  const line = value.slice(lineStart, lineEnd < 0 ? value.length : lineEnd);
  const prefix = value.slice(lineStart, cursor).trimStart();
  const options = suggestions
    .filter(
      (item) =>
        (!multiline || !/\s/.test(prefix)) &&
        item.toLowerCase().includes(prefix.toLowerCase()),
    )
    .slice(0, 12);
  const visible = open && options.length > 0;
  const selected = Math.min(active, options.length - 1);
  const choose = (suggestion: string) => {
    const replacement = multiline
      ? line.replace(
          /^(\s*)\S*/,
          (_match, whitespace: string) => whitespace + suggestion,
        )
      : suggestion;
    onChange(
      value.slice(0, lineStart) +
        replacement +
        (lineEnd < 0 ? "" : value.slice(lineEnd)),
    );
    input.current?.focus();
    setOpen(false);
    const position =
      lineStart +
      (multiline ? line.match(/^\s*/)?.[0].length || 0 : 0) +
      suggestion.length;
    pendingCursor.current = position;
    setCursor(position);
  };
  const props = {
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      input.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    value,
    role: "combobox",
    "aria-label": label,
    "aria-autocomplete": "list" as const,
    "aria-expanded": visible,
    "aria-controls": visible ? id : undefined,
    "aria-activedescendant": visible ? `${id}-${selected}` : undefined,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy,
    autoComplete: "off",
    spellCheck: false,
    placeholder,
    className: `input font-mono ${multiline ? "min-h-28 resize-y leading-6" : ""}`,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      pendingCursor.current = null;
      onChange(event.target.value);
      setCursor(event.target.selectionStart ?? event.target.value.length);
      setActive(0);
      setOpen(true);
    },
    onSelect: (
      event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setCursor(event.currentTarget.selectionStart ?? value.length);
    },
    onFocus: () => setOpen(true),
    onBlur: () => {
      setOpen(false);
      onBlur();
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      } else if (event.key === "ArrowDown" && options.length) {
        event.preventDefault();
        setOpen(true);
        setActive((index) => (visible ? (index + 1) % options.length : 0));
      } else if (event.key === "ArrowUp" && visible) {
        event.preventDefault();
        setActive((index) => (index + options.length - 1) % options.length);
      } else if ((event.key === "Enter" || event.key === "Tab") && visible) {
        event.preventDefault();
        choose(options[selected]);
      }
    },
  };
  return (
    <div className="relative">
      {multiline ? <textarea {...props} /> : <input {...props} />}
      {visible && (
        <ul
          id={id}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-line bg-elevated p-1 shadow-xl"
        >
          {options.map((option, index) => (
            <li
              key={option}
              id={`${id}-${index}`}
              role="option"
              aria-selected={selected === index}
              className={`cursor-pointer rounded-md px-3 py-2 font-mono text-xs ${selected === index ? "bg-accent/15 text-text" : "text-muted"}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
