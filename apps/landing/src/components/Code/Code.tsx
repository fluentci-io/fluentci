import { highlight } from "../../highlight";

export function Code({
  children,
  language = "bash",
  className = "",
}: {
  children: string;
  language?: string;
  className?: string;
}) {
  return (
    <pre className={`code overflow-x-auto ${className}`} tabIndex={0}>
      <code
        dangerouslySetInnerHTML={{ __html: highlight(children, language) }}
      />
    </pre>
  );
}
