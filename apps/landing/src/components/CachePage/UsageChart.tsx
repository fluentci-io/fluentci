import { useEffect, useRef, useState } from "react";
import { formatBytes, usageDays, type UsageSample } from "../../cache/usage";

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
  const [active, setActive] = useState(13);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0])
        setWidth(Math.max(240, Math.floor(entries[0].contentRect.width)));
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const days = usageDays(samples ?? []);
  const maximum = Math.max(1, ...days.map((day) => day.sample?.[metric] ?? 0));
  const left = 54,
    plot = width - left - 8,
    step = plot / 14,
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
      timeZone: "UTC",
    });
  return (
    <div
      className="mt-6 min-w-0"
      role="region"
      aria-label="Cache usage last 14 days"
      ref={container}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Usage · last 14 days</h3>
        <label className="text-xs text-muted">
          Metric
          <select
            aria-label="Usage chart metric"
            className="ml-2 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs text-ink"
            value={metric}
            onChange={(event) =>
              setMetric(event.target.value as "bytes" | "keyCount")
            }
          >
            <option value="bytes">Storage size</option>
            <option value="keyCount">Cache entries</option>
          </select>
        </label>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-muted">
          Usage history unavailable. Refresh entries to try again.
        </p>
      ) : samples === undefined ? (
        <p role="status" className="mt-4 text-sm text-muted">
          Loading usage history…
        </p>
      ) : (
        <>
          <svg
            className="mt-3 block max-w-full"
            width="100%"
            height="210"
            viewBox={`0 0 ${width} 210`}
            aria-label={`Daily ${metric === "bytes" ? "storage size" : "key count"} in UTC`}
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
                    x={left + index * step + step * 0.17}
                    y={baseline - height}
                    width={Math.max(4, step * 0.66)}
                    height={height}
                    rx="2"
                    className={
                      day.sample
                        ? "fill-accent outline-none focus:stroke-ink"
                        : "fill-current text-muted opacity-30 outline-none focus:stroke-ink"
                    }
                    opacity={active === index ? 1 : 0.7}
                    role="button"
                    tabIndex={0}
                    aria-label={`${day.date}: ${value(day.sample)}`}
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onClick={() => setActive(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActive(index);
                      }
                    }}
                  >
                    <title>
                      {day.date}: {value(day.sample)}
                      {day.sample ? ` · ${day.sample.keyCount} keys` : ""}
                    </title>
                  </rect>
                  {(width > 550 || index % 3 === 0 || index === 13) && (
                    <text
                      x={left + (index + 0.5) * step}
                      y={193}
                      textAnchor="middle"
                      className="fill-current text-muted"
                      fontSize="10"
                    >
                      {dayLabel(day.date)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="text-xs text-muted" aria-live="polite">
            {dayLabel(days[active].date)} · {value(days[active].sample)}
            {days[active].sample
              ? ` · ${days[active].sample!.keyCount.toLocaleString()} keys`
              : ""}{" "}
            · UTC
          </p>
          <p className="mt-2 text-xs leading-6 text-muted">
            Daily storage snapshots. Days without a recorded measurement show no
            data. This chart does not count CDN requests or cache hits.
          </p>
        </>
      )}
    </div>
  );
}
