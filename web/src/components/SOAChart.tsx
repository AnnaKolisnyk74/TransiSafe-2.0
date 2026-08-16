import { Info, ShieldCheck } from "lucide-react";
import type { AnalysisInput, AnalysisResponse, SoaCurve } from "../types";
import { formatNumber } from "./format";

const colors = ["#1976d2", "#20a4c7", "#38a169", "#e0a12f", "#d35d6e", "#6c63b5"];

function labelPulse(seconds: number) {
  if (seconds >= 1000000) return "DC";
  if (seconds >= 1) return `${formatNumber(seconds)} s`;
  if (seconds >= 0.001) return `${formatNumber(seconds * 1000)} ms`;
  return `${formatNumber(seconds * 1000000)} µs`;
}

export function SOAChart({ curves, input, result }: { curves: SoaCurve[]; input: AnalysisInput; result: AnalysisResponse }) {
  const allPoints = curves.flatMap((curve) => curve.points);
  if (!allPoints.length) return <section className="result-card soa-chart"><header><div><span>SOA Kennlinie</span><h3>Keine gespeicherten Kurven verfügbar</h3></div></header></section>;
  const width = 680, height = 330, left = 62, right = 24, top = 24, bottom = 48;
  const minX = Math.max(0.5, Math.min(...allPoints.map((point) => point.vds_v))), maxX = Math.max(...allPoints.map((point) => point.vds_v));
  const minY = Math.max(0.1, Math.min(...allPoints.map((point) => point.id_a))), maxY = Math.max(...allPoints.map((point) => point.id_a));
  const log = (value: number) => Math.log10(Math.max(value, 0.000001));
  const x = (value: number) => left + (log(value) - log(minX)) / (log(maxX) - log(minX)) * (width - left - right);
  const y = (value: number) => top + (log(maxY) - log(value)) / (log(maxY) - log(minY)) * (height - top - bottom);
  const xTicks = [1, 10, 100].filter((value) => value >= minX && value <= maxX);
  const yTicks = [0.1, 1, 10, 100, 1000].filter((value) => value >= minY && value <= maxY);
  const safePoint = result.optimization.max_current_available ? { vds_v: input.vds_v, id_a: result.optimization.max_current_a } : null;
  return <section className="result-card soa-chart">
    <header><div><span><ShieldCheck size={14}/>SOA Kennlinie</span><h3>Stored Safe-Operating-Area Curves</h3></div><small>VDS [V] · ID [A]</small></header>
    <div className="soa-body"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stored SOA curves and current operating point">
      <rect className="chart-plot" x={left} y={top} width={width-left-right} height={height-top-bottom}/>
      {xTicks.map((tick) => <g key={`x-${tick}`}><line className="chart-grid" x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom}/><text className="chart-tick" x={x(tick)} y={height-17} textAnchor="middle">{tick}</text></g>)}
      {yTicks.map((tick) => <g key={`y-${tick}`}><line className="chart-grid" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className="chart-tick" x={left-9} y={y(tick)+3} textAnchor="end">{tick}</text></g>)}
      <line className="chart-axis" x1={left} x2={width-right} y1={height-bottom} y2={height-bottom}/><line className="chart-axis" x1={left} x2={left} y1={top} y2={height-bottom}/>
      {curves.map((curve, index) => <polyline className="soa-curve" key={curve.pulse_duration_s} fill="none" stroke={colors[index % colors.length]} strokeWidth="2.6" strokeDasharray={curve.pulse_duration_s >= 1000000 ? "7 5" : undefined} points={curve.points.map((point) => `${x(point.vds_v)},${y(point.id_a)}`).join(" ")}/>) }
      {safePoint && safePoint.id_a > 0 && <circle className="chart-point safe-point" cx={x(safePoint.vds_v)} cy={y(safePoint.id_a)} r="6" fill="#2ea76f" stroke="#fff" strokeWidth="2.5"/>}
      <circle className="chart-point current-point" cx={x(input.vds_v)} cy={y(input.id_a)} r="7" fill="#0a6ed1" stroke="#fff" strokeWidth="3"/>
      <text className="point-label" x={Math.min(width-right-72, x(input.vds_v)+12)} y={Math.max(top+14, y(input.id_a)-10)}>Betriebspunkt</text>
      <text className="axis-label" x={width-right} y={height-4} textAnchor="end">VDS [V]</text><text className="axis-label" x="12" y={top+4}>ID [A]</text>
    </svg><div className="soa-legend">{curves.map((curve, index) => <span key={curve.pulse_duration_s}><i style={{ background: colors[index % colors.length] }}/>{labelPulse(curve.pulse_duration_s)}</span>)}<span><i className="point current"/>Betriebspunkt</span>{safePoint && <span><i className="point safe"/>Engine-Grenzpunkt</span>}</div></div>
    <div className="chart-note"><Info size={18}/><span>Kurven werden unverändert aus der gespeicherten Engineering-Digitalisierung dargestellt. TransiSafe berechnet im Browser keine SOA-Grenze.</span></div>
  </section>;
}
