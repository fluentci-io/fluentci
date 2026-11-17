import { useEffect, useId, useRef, useState } from "react";
import { formatBytes, usageDays, type UsageSample } from "../../cache/usage";
import { CacheChartSkeleton } from "./CacheSkeleton";

export function UsageChart({
  samples,
  error,
}: {
  samples?: UsageSample[];
  error?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [metric, setMetric] = useState<"bytes" | "keyCount">("bytes");
  const [active, setActive] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number }>();
  const tooltipId = useId();
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0])
        setWidth(Math.max(1, Math.floor(entries[0].contentRect.width)));
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const days = usageDays(samples ?? []);
  const maximum = Math.max(1, ...days.map((day) => day.sample?.[metric] ?? 0));
  const left = 54,
    plot = width - left - 8,
    step = plot / days.length,
    baseline = 170;
  const value = (sample?: UsageSample) =>
    sample
      ? metric === "bytes"
        ? formatBytes(sample.bytes)
        : `${sample.keyCount.toLocaleString()} keys`
      : "No data";
  const dayLabel = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return (
    <div
      className="mt-6 min-w-0"
      role="region"
      aria-label="Cache usage last 30 days"
      ref={container}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Usage · last month</h3>
        <label className="text-xs text-muted">
          Metric
          <span className="relative ml-2 inline-flex">
            <select
              aria-label="Usage chart metric"
              className="appearance-none rounded-lg border border-line bg-paper py-1.5 pl-3 pr-9 text-xs text-ink"
              value={metric}
              disabled={samples === undefined || Boolean(error)}
              onChange={(event) =>
                setMetric(event.target.value as "bytes" | "keyCount")
              }
            >
              <option value="bytes">Storage size</option>
              <option value="keyCount">Cache entries</option>
            </select>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 7.5 5 5 5-5" />
            </svg>
          </span>
        </label>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-muted">
          Usage history unavailable. Refresh entries to try again.
        </p>
      ) : samples === undefined ? (
        <CacheChartSkeleton />
      ) : (
        <>
          <div className="relative mt-3">
            <svg
              className="block max-w-full"
              width="100%"
              height="185"
              viewBox={`0 0 ${width} 185`}
              aria-label={`Daily ${metric === "bytes" ? "storage size" : "key count"} in UTC`}
              onMouseLeave={() => setActive(null)}
            >
              {[0, 0.5, 1].map((fraction) => (
                <g key={fraction}>
                  <line
                    x1={left}
                    x2={width - 8}
                    y1={baseline - fraction * 145}
                    y2={baseline - fraction * 145}
                    stroke="currentColor"
                    className="text-line"
                  />
                  <text
                    x={left - 7}
                    y={baseline - fraction * 145 + 4}
                    textAnchor="end"
                    className="fill-current text-muted"
                    fontSize="10"
                  >
                    {metric === "bytes"
                      ? formatBytes(Math.round(maximum * fraction))
                      : Math.round(maximum * fraction).toLocaleString()}
                  </text>
                </g>
              ))}
              {days.map((day, index) => {
                const height = day.sample
                  ? Math.max(2, (day.sample[metric] / maximum) * 145)
                  : 2;
                return (
                  <g key={day.date}>
                    <rect
                      x={left + index * step}
                      y={25}
                      width={step}
                      height={145}
                      rx="2"
                      className="fill-accent transition-opacity duration-150 motion-reduce:transition-none"
                      opacity={active === index ? 0.16 : 0}
                      aria-hidden="true"
                      pointerEvents="none"
                    />
                    <rect
                      x={left + index * step + step * 0.17}
                      y={baseline - height}
                      width={Math.max(1, step * 0.66)}
                      height={height}
                      rx="2"
                      className={
                        day.sample
                          ? "fill-accent"
                          : "fill-current text-muted opacity-30"
                      }
                      opacity={active === null || active === index ? 1 : 0.55}
                      aria-hidden="true"
                      pointerEvents="none"
                    />
                    <rect
                      x={left + index * step}
                      y={25}
                      width={step}
                      height={145}
                      fill="transparent"
                      className="cursor-crosshair outline-none focus:stroke-accent"
                      role="button"
                      tabIndex={0}
                      aria-label={`${day.date}: ${value(day.sample)}`}
                      aria-describedby={
                        active === index ? tooltipId : undefined
                      }
                      onMouseMove={(event) => {
                        const bounds =
                          event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                        setCursor({
                          x: event.clientX - bounds.left,
                          y: event.clientY - bounds.top,
                        });
                        setActive(index);
                      }}
                      onFocus={() => {
                        setCursor(undefined);
                        setActive(index);
                      }}
                      onBlur={() => setActive(null)}
                      onClick={() => {
                        setCursor(undefined);
                        setActive(index);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActive(index);
                        }
                      }}
                    />
                  </g>
                );
              })}
            </svg>
            {active !== null && (
              <div
                id={tooltipId}
                role="tooltip"
                className="pointer-events-none absolute z-10 w-40 rounded-lg border border-line bg-paper px-3 py-2 text-xs shadow-lg"
                style={{
                  left: Math.max(
                    80,
                    Math.min(
                      width - 80,
                      cursor?.x ?? left + (active + 0.5) * step,
                    ),
                  ),
                  top:
                    Math.max(
                      45,
                      cursor?.y ??
                        baseline -
                          ((days[active].sample?.[metric] ?? 0) / maximum) *
                            145,
                    ) - 12,
                  transform: "translate(-50%, -100%)",
                }}
              >
                <p className="font-medium">
                  {dayLabel(days[active].date)} · UTC
                </p>
                <p className="mt-1 text-muted">{value(days[active].sample)}</p>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs leading-6 text-muted">
            Daily storage snapshots. Days without a recorded measurement show no
            data. This chart does not count CDN requests or cache hits.
          </p>
        </>
      )}
    </div>
  );
}
