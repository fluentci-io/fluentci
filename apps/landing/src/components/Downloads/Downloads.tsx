import { type Plugin } from "../../registry/client";
import { DownloadIcon } from "../DownloadIcon";

export function Downloads({ plugin }: { plugin: Plugin }) {
  const points = plugin.dailyDownloads;
  const weekly = points?.reduce((sum, day) => sum + day.downloads, 0);
  const maximum = Math.max(1, ...(points?.map((day) => day.downloads) ?? []));
  if (!points && !(plugin.downloads && plugin.downloads > 0)) return null;
  return (
    <section
      className="border-t border-line pt-5"
      aria-label="Module downloads"
    >
      {points && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm">Weekly downloads</h3>
            <span className="font-mono text-xl text-accent">
              {weekly?.toLocaleString()}
            </span>
          </div>
          <div
            className="download-chart"
            role="img"
            aria-label={`${weekly} downloads in the last 7 days`}
          >
            {points.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.downloads} downloads`}
              >
                <span
                  style={{
                    height: `${Math.max(3, (day.downloads / maximum) * 100)}%`,
                  }}
                />
                <small>
                  {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(
                    undefined,
                    { weekday: "narrow", timeZone: "UTC" },
                  )}
                </small>
              </div>
            ))}
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
