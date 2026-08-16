import { Database, Gauge, Info, X } from "lucide-react";
import type { AnalysisInput, AnalysisResponse, ModelSummary } from "../types";
import { DataSourceCard } from "./DataSourceCard";
import { EngineeringCheckMatrix } from "./EngineeringCheckMatrix";
import { formatNumber } from "./format";

export function EngineeringDetails({ open, onClose, result, input, model }: { open: boolean; onClose: () => void; result: AnalysisResponse; input: AnalysisInput; model: ModelSummary }) {
  if (!open) return null;
  return <div className="details-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="engineering-details-drawer" role="dialog" aria-modal="true" aria-label="Engineering Details">
    <header><div><span>Technical evidence</span><h2>Engineering Details</h2></div><button type="button" onClick={onClose} aria-label="Schließen"><X size={19}/></button></header>
    {result.analysis_metadata.warnings.length > 0 && <section className="detail-warnings"><h3><Info size={16}/>Warnings</h3>{result.analysis_metadata.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
    <EngineeringCheckMatrix result={result} input={input}/>
    <section className="detail-section"><h3><Gauge size={17}/>Engine-provided limits</h3><dl><div><dt>At VDS = {formatNumber(input.vds_v)} V</dt><dd>{result.optimization.max_current_available ? `${formatNumber(result.optimization.max_current_a, 2)} A` : "UNKNOWN"}</dd></div><div><dt>At ID = {formatNumber(input.id_a)} A</dt><dd>{result.optimization.max_voltage_available ? `${formatNumber(result.optimization.max_voltage_v, 2)} V` : "UNKNOWN"}</dd></div></dl></section>
    <section className="detail-section"><h3><Database size={17}/>Calculation metadata</h3><dl><div><dt>Dataset</dt><dd>{result.source.dataset_version}</dd></div><div><dt>C-Engine</dt><dd>{result.source.engine_version}</dd></div><div><dt>App</dt><dd>{result.source.application_version}</dd></div><div><dt>Curve status</dt><dd>{result.source.curve_status}</dd></div><div><dt>Data coverage</dt><dd>{result.result.data_complete ? "Complete" : "Incomplete"}</dd></div></dl></section>
    <DataSourceCard result={result} model={model}/>
  </aside></div>;
}
