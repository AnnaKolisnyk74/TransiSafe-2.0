import { Check, CircleAlert, DatabaseZap, X } from "lucide-react";
import type { AnalysisInput, AnalysisResponse } from "../types";
import { formatNumber } from "./format";

export function EngineeringCheckMatrix({ result, input, compact = false }: { result: AnalysisResponse; input: AnalysisInput; compact?: boolean }) {
  const checks = result.result.checks;
  const rows = [
    { label: "Voltage", value: `${formatNumber(input.vds_v)} V`, basis: `${formatNumber(result.source.vds_max_v)} V device rating`, passed: checks.voltage },
    { label: "Current", value: `${formatNumber(input.id_a)} A`, basis: `${formatNumber(result.source.id_continuous_max_a)} A continuous · ${formatNumber(result.source.id_pulse_max_a)} A pulse rating`, passed: checks.current },
    { label: "Safe operating area", value: result.result.soa_limit_a > 0 ? `${formatNumber(input.id_a)} A / ${formatNumber(result.result.soa_limit_a)} A stored boundary` : "No boundary value returned", basis: "Native C-engine SOA interpolation", passed: checks.soa },
    { label: "Junction temperature", value: `${formatNumber(result.result.tj_c, 1)} °C / ${formatNumber(result.source.tj_max_c, 0)} °C`, basis: `${formatNumber(result.result.temperature_margin_c, 1)} K thermal margin`, passed: checks.temperature },
    { label: "Data coverage", value: result.result.data_complete ? "Required engineering data available" : "Required curve or model data unavailable", basis: "No SAFE classification without complete data", passed: result.result.data_complete, coverage: true },
  ];
  const visibleRows = compact ? rows.filter((row) => !row.coverage) : rows;
  return <section className={`result-card check-matrix ${compact ? "compact-matrix" : ""}`}><header><div><span>Operating point assessment</span><h3>Engineering check matrix</h3></div>{!compact && <small>Values returned by the native analysis path</small>}</header><div className="matrix-head"><span>Check</span><span>Assessment</span>{!compact && <span>Engineering basis</span>}<span>Status</span></div>{visibleRows.map((row) => <div className="matrix-row" key={row.label}><div className="matrix-label">{row.coverage ? <DatabaseZap size={16}/> : row.passed ? <Check size={16}/> : <X size={16}/>}<b>{row.label}</b></div><strong>{row.value}</strong>{!compact && <span>{row.basis}</span>}<em className={row.passed ? "pass" : row.coverage ? "incomplete" : "fail"}>{row.passed ? "PASS" : row.coverage ? <><CircleAlert size={12}/>INCOMPLETE</> : "FAIL"}</em></div>)}</section>;
}
