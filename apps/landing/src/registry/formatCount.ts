export function formatCompactCount(count: number): string {
  for (const [unit, suffix] of [
    [1_000_000_000_000, "T"],
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ] as const) {
    if (count >= unit) return `${Math.floor(count / unit)}${suffix}+`;
  }
  return count.toLocaleString();
}
