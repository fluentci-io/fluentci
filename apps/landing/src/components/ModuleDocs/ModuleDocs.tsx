import { runCommand, type Plugin } from "../../registry/client";
import { CopyCommand } from "../CopyCommand";
import { TypeLabel } from "../TypeLabel";

function example(type: string) {
  if (type.endsWith("[]")) {
    const value =
      type === "string[]"
        ? '["demo"]'
        : type === "boolean[]"
          ? "[true]"
          : "[1]";
    return `'${value}'`;
  }
  return type === "boolean"
    ? "true"
    : type === "integer"
      ? "1"
      : type === "number"
        ? "1.5"
        : "demo";
}

export function ModuleDocs({
  plugin,
  handle,
  query = "",
}: {
  plugin: Plugin;
  handle: string;
  query?: string;
}) {
  const functions = plugin.functions ?? [];
  if (!functions.length)
    return (
      <p className="py-8 text-sm text-muted">
        No function metadata has been published.
      </p>
    );
  const term = query.trim().toLocaleLowerCase();
  const indexed = functions.map((fn, index) => ({ fn, index }));
  const names = indexed.filter(({ fn }) =>
    fn.name.toLocaleLowerCase().includes(term),
  );
  const visible = names.length
    ? names
    : indexed.filter(({ fn }) =>
        [
          fn.name,
          fn.description,
          fn.returnType,
          ...(fn.args ?? []).flatMap((arg) => [
            arg.name,
            arg.type,
            arg.description,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(term),
      );
  if (!visible.length)
    return (
      <p role="status" className="py-8 text-sm text-muted">
        No functions match “{query.trim()}”.
      </p>
    );
  return (
    <div className="mt-7 grid min-w-0 gap-8 lg:grid-cols-[140px_minmax(0,1fr)]">
      <nav
        aria-label="Module functions"
        className="flex flex-wrap content-start gap-3 lg:sticky lg:top-24 lg:flex-col lg:self-start"
      >
        <span className="w-full text-xs uppercase tracking-widest text-muted">
          Functions
        </span>
        {visible.map(({ fn, index }) => (
          <a
            key={fn.name}
            className="text-link truncate font-mono text-xs"
            href={`#function-${index}`}
          >
            {fn.name}
          </a>
        ))}
      </nav>
      <div className="min-w-0 divide-y divide-line">
        {visible.map(({ fn, index }) => {
          const named = fn.inputFormat === "json" || fn.inputFormat === "wit";
          const arguments_ =
            fn.args
              ?.filter((arg) => arg.required !== false)
              .map(
                (arg) => `${named ? `--${arg.name} ` : ""}${example(arg.type)}`,
              )
              .join(" ") ?? "";
          const command = `${runCommand(plugin, handle, fn.name)}${arguments_ ? ` ${arguments_}` : ""}`;
          return (
            <section
              key={fn.name}
              id={`function-${index}`}
              className="scroll-mt-24 pb-9 pt-9 first:pt-0"
              aria-label={`${fn.name} function`}
            >
              <h2 className="font-mono text-xl text-ink">{fn.name}</h2>
              <div className="mt-3 break-words font-mono text-sm leading-7 text-muted">
                <span className="module-function-name">{fn.name}</span>(
                {fn.args
                  ? fn.args.map((arg, i) => (
                      <span key={arg.name}>
                        {i > 0 ? ", " : ""}
                        <span className="text-ink">
                          {arg.name}
                          {arg.required === false ? "?" : ""}
                        </span>
                        : <TypeLabel type={arg.type} />
                      </span>
                    ))
                  : "…"}
                )
                {fn.returnType && (
                  <>
                    {" "}
                    → <TypeLabel type={fn.returnType} />
                  </>
                )}
              </div>
              {fn.description && (
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted">
                  {fn.description}
                </p>
              )}
              <h3 className="mb-3 mt-6 text-sm">Arguments</h3>
              {fn.args ? (
                fn.args.length ? (
                  <dl className="divide-y divide-line">
                    {fn.args.map((arg) => (
                      <div key={arg.name} className="py-4 first:pt-0">
                        <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <code className="text-sm text-ink">
                            {named ? "--" : ""}
                            {arg.name}
                          </code>
                          <TypeLabel type={arg.type} />
                          <span className="text-[11px] text-muted">
                            {arg.required === false ? "optional" : "required"}
                          </span>
                        </dt>
                        {arg.description && (
                          <dd className="mt-2 whitespace-pre-line text-xs leading-6 text-muted">
                            {arg.description}
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-muted">No arguments.</p>
                )
              ) : (
                <p className="text-xs text-muted">
                  Source argument metadata was not published.
                </p>
              )}
              <h3 className="mb-3 mt-6 text-sm">Returns</h3>
              {fn.returnType ? (
                <TypeLabel type={fn.returnType} />
              ) : (
                <p className="text-xs text-muted">Not declared.</p>
              )}
              <h3 className="mb-3 mt-6 text-sm">CLI usage</h3>
              <CopyCommand command={command} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
