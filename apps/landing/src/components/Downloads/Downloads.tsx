import { useId, useState } from "react";
import { type Plugin } from "../../registry/client";
import { DownloadIcon } from "../DownloadIcon";

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

export function Downloads({ plugin }: { plugin: Plugin }) {
  const [active, setActive] = useState<number>();
  const tooltipId = useId();
  const gradientId = `download-gradient-${tooltipId.replace(/:/g, "")}`;
  const points = plugin.dailyDownloads;
  const weekly = points?.reduce((sum, day) => sum + day.downloads, 0);
  const maximum = Math.max(1, ...(points?.map((day) => day.downloads) ?? []));
  if (!points && !(plugin.downloads && plugin.downloads > 0)) return null;
  const plot = points?.map((day, index) => ({
    ...day,
    x: points.length > 1 ? 8 + (index / (points.length - 1)) * 264 : 140,
    y: 76 - (day.downloads / maximum) * 60,
  }));
  const line = plot
    ?.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
    .join(" ");
  const selected = active === undefined ? undefined : plot?.[active];
  return (
    <section
      className="border-t border-line pt-5"
      aria-label="Module downloads"
    >
      {plot && plot.length > 0 && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm">Weekly downloads</h3>
            <span className="font-mono text-xl text-accent">
              {weekly?.toLocaleString()}
            </span>
          </div>
          <div className="download-line-chart">
            {selected && (
              <div
                id={tooltipId}
                role="tooltip"
                className="download-tooltip"
                style={{
                  left: `clamp(68px, ${(selected.x / 280) * 100}%, calc(100% - 68px))`,
                }}
              >
                <span>{dayLabel(selected.date)}</span>
                <strong>{selected.downloads.toLocaleString()} downloads</strong>
              </div>
            )}
            <svg
              role="img"
              aria-label={`${weekly} downloads in the last 7 days`}
              aria-describedby={selected ? tooltipId : undefined}
              tabIndex={0}
              viewBox="0 0 280 90"
              className="download-line-plot"
              onPointerMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - bounds.left) / bounds.width) * 280;
                setActive(
                  Math.max(
                    0,
                    Math.min(
                      plot.length - 1,
                      Math.round(((x - 8) / 264) * (plot.length - 1)),
                    ),
                  ),
                );
              }}
              onPointerLeave={() => setActive(undefined)}
              onBlur={() => setActive(undefined)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                setActive((index) =>
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? plot.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            plot.length - 1,
                            (index ?? 0) +
                              (event.key === "ArrowRight" ? 1 : -1),
                          ),
                        ),
                );
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-accent)"
                    stopOpacity="0.24"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-accent)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <desc>
                Use the left and right arrow keys to inspect daily downloads.
              </desc>
              <path d="M8 76H272" stroke="var(--color-line)" fill="none" />
              <path
                d={`${line} L${plot[plot.length - 1].x},76 L${plot[0].x},76 Z`}
                fill="var(--color-accent)"
                opacity="0.06"
              />
              <path
                d={line}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {selected && (
                <>
                  <line
                    className="download-cursor"
                    x1={selected.x}
                    x2={selected.x}
                    y1="8"
                    y2="80"
                    stroke="var(--color-muted)"
                    strokeDasharray="3 3"
                    opacity="0.7"
                  />
                  <circle
                    cx={selected.x}
                    cy={selected.y}
                    r="4"
                    fill="var(--color-accent)"
                    stroke="var(--color-paper)"
                    strokeWidth="2"
                  />
                </>
              )}
            </svg>
            <div className="flex justify-between font-mono text-[10px] text-muted">
              <span>{dayLabel(plot[0].date)}</span>
              <span>{dayLabel(plot[plot.length - 1].date)}</span>
            </div>
          </div>
        </>
      )}
      {(plugin.downloads ?? 0) > 0 && (
        <p className="mt-4 text-xs text-muted">
          <DownloadIcon /> {plugin.downloads!.toLocaleString()} total downloads
        </p>
      )}
    </section>
  );
}
