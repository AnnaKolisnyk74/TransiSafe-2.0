export function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01) return value.toExponential(2);
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(value);
}
export function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
