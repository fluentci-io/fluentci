export type ProtocolUsage = {
  protocol: string;
  bytes: number;
  keyCount: number;
};
export const cacheTypes: Record<string, { label: string; color: string }> = {
  nix: { label: "Nix", color: "#60a5fa" },
  generic: { label: "Generic", color: "#a78bfa" },
  sccache: { label: "sccache", color: "#fbbf24" },
  bazel: { label: "Bazel", color: "#34d399" },
  gradle: { label: "Gradle", color: "#2dd4bf" },
  maven: { label: "Maven", color: "#fb7185" },
  gocache: { label: "Go", color: "#22d3ee" },
  turbo: { label: "Turborepo", color: "#f472b6" },
  nx: { label: "Nx", color: "#818cf8" },
  buildkit: { label: "BuildKit", color: "#fb923c" },
};
export function protocolStyle(protocol: string) {
  return (
    cacheTypes[protocol] ?? {
      label: protocol === "unclassified" ? "Unclassified" : protocol,
      color: "#94a3b8",
    }
  );
}
export function usageSegments(
  sample: UsageSample | undefined,
  metric: "bytes" | "keyCount",
) {
  if (!sample) return [];
  const segments = (sample.protocols ?? [])
    .filter((part) => part[metric] > 0)
    .map((part) => ({ protocol: part.protocol, value: part[metric] }));
  const remainder =
    sample[metric] - segments.reduce((total, part) => total + part.value, 0);
  if (remainder > 0)
    segments.push({ protocol: "unclassified", value: remainder });
  return segments;
}
export type UsageSample = {
  date: string;
  bytes: number;
  keyCount: number;
  observedAt: string;
  protocols?: ProtocolUsage[];
};
export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let size = value / 1024,
    unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}
export function usageDays(samples: UsageSample[], now = new Date()) {
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - 29 + index);
    const date = day.toISOString().slice(0, 10);
    return { date, sample: samples.find((sample) => sample.date === date) };
  });
}
