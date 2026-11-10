import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  cachedInitialResults,
  cachedProfiles,
  getProfiles,
  initialResults,
  moduleTitle,
  recordKey,
  type Plugin,
  type Profile,
} from "../../registry/client";
import { ModuleLogo } from "../ModuleLogo";
import { Skeleton } from "../Skeleton";

export function ModuleMarquee() {
  const [items, setItems] = useState<Plugin[]>(
    () => cachedInitialResults() ?? [],
  );
  const [profiles, setProfiles] =
    useState<Record<string, Profile>>(cachedProfiles);
  const [loading, setLoading] = useState(
    () => cachedInitialResults() === undefined,
  );
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const viewport = useRef<HTMLDivElement>(null);
  const firstGroup = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    void initialResults()
      .then(async (packages) => {
        if (!active) return;
        setItems(packages.slice(0, 20));
        setLoading(false);
        try {
          const authors = await getProfiles(
            packages.map((item) => item.author),
            abort.signal,
          );
          if (active) setProfiles(authors);
        } catch {
          /* A DID is a valid route when a profile is unavailable. */
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = new ResizeObserver(() => setWidth(element.clientWidth));
    resize.observe(element);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(element);
    return () => {
      resize.disconnect();
      observer.disconnect();
    };
  }, [loading]);

  useEffect(() => {
    const element = viewport.current;
    const group = firstGroup.current;
    if (
      !element ||
      !group ||
      paused ||
      hovered ||
      focused ||
      reducedMotion ||
      !visible
    )
      return;
    const loopWidth = group.scrollWidth;
    if (!loopWidth) return;
    let frame: number;
    let previous: number | undefined;
    let position = element.scrollLeft;
    const animate = (time: number) => {
      if (previous !== undefined) {
        position =
          (position + Math.min(time - previous, 64) * 0.028) % loopWidth;
        element.scrollLeft = position;
      }
      previous = time;
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [items, width, paused, hovered, focused, reducedMotion, visible]);

  if (!loading && !items.length) return null;
  return (
    <section
      className="page-width pb-12 sm:pb-16"
      aria-labelledby="popular-modules-title"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 id="popular-modules-title" className="text-sm font-medium">
            Ready-to-run modules
          </h2>
          <p className="mt-1 text-xs text-muted">
            The registry’s most downloaded. Ready for the next pipeline.
          </p>
        </div>
        {!loading && !reducedMotion && (
          <button
            type="button"
            className="theme-switch shrink-0"
            aria-label={
              paused ? "Resume module animation" : "Pause module animation"
            }
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
          >
            <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
          </button>
        )}
      </div>
      {loading ? (
        <div
          role="status"
          aria-label="Loading popular modules"
          className="flex justify-around gap-8 overflow-hidden py-4"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="size-14 shrink-0 rounded-lg" />
          ))}
        </div>
      ) : (
        <div
          ref={viewport}
          className="module-marquee-viewport"
          tabIndex={0}
          aria-label="Scroll popular modules"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") setPaused(true);
          }}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setFocused(false);
          }}
        >
          <div className="module-marquee-track">
            {[false, true].map((copy) => (
              <ul
                key={String(copy)}
                ref={copy ? undefined : firstGroup}
                className="module-marquee-group"
                style={{ minWidth: width }}
                aria-label={copy ? undefined : "Most downloaded modules"}
                aria-hidden={copy ? true : undefined}
              >
                {items.map((plugin) => {
                  const handle =
                    profiles[plugin.author]?.handle ?? plugin.author;
                  const name = moduleTitle(plugin, handle);
                  return (
                    <li key={plugin.uri}>
                      <Link
                        to="/$handle/plugin/$rkey"
                        params={{ handle, rkey: recordKey(plugin) }}
                        className="module-marquee-link"
                        aria-label={`Open ${name}`}
                        title={name}
                        tabIndex={copy ? -1 : undefined}
                      >
                        <ModuleLogo plugin={plugin} />
                        <span className="block w-full truncate text-center text-[11px] text-muted">
                          {plugin.name}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
