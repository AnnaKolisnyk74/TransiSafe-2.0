import { Download, FileJson, FileSpreadsheet, FileText, Table } from "lucide-react";
import type { AnalysisInput, AnalysisResponse } from "../types";

const API = import.meta.env.VITE_API_URL ?? "";
const formats = [{ id: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet }, { id: "pdf", label: "PDF Engineering Report", icon: FileText }, { id: "csv", label: "CSV", icon: Table }, { id: "json", label: "JSON", icon: FileJson }];

export function ExportMenu({ input, result, name = "TransiSafe Analysis" }: { input: AnalysisInput; result: AnalysisResponse; name?: string }) {
  async function download(format: string) {
    const response = await fetch(`${API}/api/export/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input, result }) });
    if (!response.ok) throw new Error("Export konnte nicht erstellt werden");
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${name.replace(/[^a-z0-9_-]+/gi, "_")}.${format}`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <details className="export-menu"><summary><Download size={15}/>Export Results</summary><div>{formats.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => void download(id)}><Icon size={16}/>{label}</button>)}</div></details>;
}
