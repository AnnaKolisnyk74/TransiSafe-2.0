import { Download } from "lucide-react";
import type { AnalysisInput, AnalysisResponse } from "../types";

const API = import.meta.env.VITE_API_URL ?? "";
const formats = [{ id: "xlsx", label: "Excel (.xlsx)" }, { id: "pdf", label: "PDF Engineering Report" }, { id: "csv", label: "CSV" }, { id: "json", label: "JSON" }];

function FormatIcon({ format }: { format: string }) {
  if (format === "xlsx") return <svg className="export-format-icon excel" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h12v18H8z"/><path className="sheet-detail" d="M11 7h6M11 11h6M11 15h6M11 19h6"/><path className="badge" d="M3 6h9v12H3z"/><path className="glyph" d="m5.2 9 4.6 6m0-6-4.6 6"/></svg>;
  if (format === "pdf") return <svg className="export-format-icon pdf" viewBox="0 0 24 24" aria-hidden="true"><path className="page" d="M5 2.5h9l5 5V22H5z"/><path className="fold" d="M14 2.5V8h5"/><path className="glyph" d="M8 12.5h8M8 16h8M8 19h5"/></svg>;
  if (format === "csv") return <svg className="export-format-icon csv" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path className="grid" d="M3 9h18M3 14h18M9 4v16M15 4v16"/></svg>;
  return <svg className="export-format-icon json" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3C6.5 3 6 4.5 6 7v2c0 1.8-.8 3-2.5 3C5.2 12 6 13.2 6 15v2c0 2.5.5 4 3 4M15 3c2.5 0 3 1.5 3 4v2c0 1.8.8 3 2.5 3-1.7 0-2.5 1.2-2.5 3v2c0 2.5-.5 4-3 4"/></svg>;
}

export function ExportMenu({ input, result, name = "TransiSafe Analysis" }: { input: AnalysisInput; result: AnalysisResponse; name?: string }) {
  async function download(format: string) {
    const response = await fetch(`${API}/api/export/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input, result }) });
    if (!response.ok) throw new Error("Export konnte nicht erstellt werden");
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${name.replace(/[^a-z0-9_-]+/gi, "_")}.${format}`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <details className="export-menu"><summary><Download size={15}/>Export Results</summary><div>{formats.map(({ id, label }) => <button key={id} type="button" onClick={() => void download(id)}><FormatIcon format={id}/>{label}</button>)}</div></details>;
}
