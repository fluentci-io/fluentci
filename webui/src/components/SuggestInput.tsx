import { IconPackage } from "@tabler/icons-react";
import { forwardRef, useId, useLayoutEffect, useRef, useState } from "react";

export const SuggestInput = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    suggestions: string[];
    labels?: Record<string, string>;
    suggestionIcon?: React.ReactNode;
    details?: Record<
      string,
      { badge: string; description?: string; logo?: string | null }
    >;
    onFocus?: () => void;
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
    labels = {},
    suggestionIcon,
    details = {},
    onFocus,
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
        `${item} ${labels[item] || ""}`
          .toLowerCase()
          .includes(prefix.toLowerCase()),
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
    autoCapitalize: "none",
    autoCorrect: "off",
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
    onFocus: () => {
      setOpen(true);
      onFocus?.();
    },
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
              aria-label={labels[option] || option}
              aria-description={
                details[option]
                  ? `${details[option].badge}. ${details[option].description || ""}`
                  : labels[option]
                    ? option
                    : undefined
              }
              aria-selected={selected === index}
              className={`cursor-pointer rounded-md px-3 py-2 font-mono text-xs ${selected === index ? "bg-accent/15 text-text" : "text-muted"}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              <div className="flex items-center justify-between gap-2">
                {suggestionIcon && (
                  <span aria-hidden="true" className="shrink-0 text-muted">
                    {suggestionIcon}
                  </span>
                )}
                {details[option] && (
                  <ModuleLogo
                    key={details[option].logo || "placeholder"}
                    url={details[option].logo}
                  />
                )}
                <span className="min-w-0 flex-1 break-all">
                  {labels[option] || option}
                </span>
                {details[option] && (
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-sans text-[9px] ${details[option].badge === "Registry" ? "border-accent/30 text-accent" : "border-line text-muted"}`}
                  >
                    {details[option].badge}
                  </span>
                )}
              </div>
              {labels[option] && labels[option] !== option && (
                <p className="mt-1 break-all text-[10px] leading-4 text-muted">
                  {option}
                </p>
              )}
              {details[option]?.description && (
                <p className="mt-1 line-clamp-2 font-sans text-[10px] leading-4 text-muted">
                  {details[option].description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

function ModuleLogo({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  const valid = url && /^https?:\/\//i.test(url);
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-canvas"
      aria-hidden="true"
    >
      {valid && !failed ? (
        <img
          src={url}
          alt=""
          className="size-5 object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <IconPackage size={16} className="text-muted" />
      )}
    </span>
  );
}
