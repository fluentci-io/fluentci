export type UsageSample = {
  date: string;
  bytes: number;
  keyCount: number;
  observedAt: string;
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
