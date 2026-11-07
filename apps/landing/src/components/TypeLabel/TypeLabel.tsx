export function TypeLabel({ type }: { type: string }) {
  return (
    <code className="font-mono text-sm break-words">
      {type.split(/([A-Za-z][A-Za-z0-9_]*)/).map((token, index) => {
        const kind = /^(string|str|text)$/i.test(token)
          ? "string"
          : /^(integer|int|number|float|double|i32|i64|f32|f64)$/i.test(token)
            ? "number"
            : /^(boolean|bool)$/i.test(token)
              ? "boolean"
              : "other";
        return (
          <span key={index} className={`module-type-${kind}`}>
            {token}
          </span>
        );
      })}
    </code>
  );
}
