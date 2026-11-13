import { Fragment, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

const links =
  /https?:\/\/[^\s<>"']+|(?<![\w.+%-])@((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?)/gi;

function urlEnd(raw: string) {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let end = raw.length;
  while (end) {
    const last = raw[end - 1];
    const value = raw.slice(0, end);
    if (
      /[.,!?;:]/.test(last) ||
      (pairs[last] &&
        value.split(last).length > value.split(pairs[last]).length)
    )
      end--;
    else break;
  }
  return end;
}

export function ProfileBio({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(links)) {
    parts.push(text.slice(cursor, match.index));
    if (match[1]) {
      parts.push(
        <Link
          key={match.index}
          to="/$handle"
          params={{ handle: match[1].toLowerCase() }}
          className="text-link"
        >
          {match[0]}
        </Link>,
      );
    } else {
      const end = urlEnd(match[0]);
      const url = match[0].slice(0, end);
      parts.push(
        <Fragment key={match.index}>
          <a
            className="text-link break-all"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {url}
          </a>
          {match[0].slice(end)}
        </Fragment>,
      );
    }
    cursor = match.index + match[0].length;
  }
  parts.push(text.slice(cursor));
  return (
    <p className="publisher-bio mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted">
      {parts}
    </p>
  );
}
