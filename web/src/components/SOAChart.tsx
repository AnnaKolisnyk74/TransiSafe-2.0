import { Info, ShieldCheck } from "lucide-react";
import type { AnalysisInput, AnalysisResponse, SoaCurve } from "../types";
import { formatNumber } from "./format";

const fallbackColors = ["#168BFF", "#22D3EE", "#32D583", "#F5B942", "#FF647C", "#8B5CF6"];

function curveColor(seconds: number, index: number) {
  if (seconds >= 1000000) return "#F5B942";
  if (seconds >= 0.01) return "#32D583";
  if (seconds >= 0.001) return "#22D3EE";
  if (seconds > 0) return "#168BFF";
  return fallbackColors[index % fallbackColors.length];
}

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
      <defs>
        <pattern id="soa-minor-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path className="chart-grid-minor" d="M 12 0 L 0 0 0 12" fill="none"/></pattern>
        <pattern id="soa-major-grid" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="url(#soa-minor-grid)"/><path className="chart-grid-major" d="M 60 0 L 0 0 0 60" fill="none"/></pattern>
        <marker id="axis-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto"><path className="axis-arrow" d="M0,0 L7,3.5 L0,7 z"/></marker>
      </defs>
      <rect className="chart-plot" x={left} y={top} width={width-left-right} height={height-top-bottom}/>
      <rect className="chart-paper-grid" x={left} y={top} width={width-left-right} height={height-top-bottom} fill="url(#soa-major-grid)"/>
      {xTicks.map((tick) => <g key={`x-${tick}`}><line className="chart-grid" x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom}/><text className="chart-tick" x={x(tick)} y={height-17} textAnchor="middle">{tick}</text></g>)}
      {yTicks.map((tick) => <g key={`y-${tick}`}><line className="chart-grid" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className="chart-tick" x={left-9} y={y(tick)+3} textAnchor="end">{tick}</text></g>)}
      <line className="chart-axis" markerEnd="url(#axis-arrow)" x1={left} x2={width-right+2} y1={height-bottom} y2={height-bottom}/><line className="chart-axis" markerEnd="url(#axis-arrow)" x1={left} x2={left} y1={height-bottom} y2={top-2}/>
      {curves.map((curve, index) => { const color = curveColor(curve.pulse_duration_s, index); return <g key={curve.pulse_duration_s}><polyline className="soa-curve" fill="none" stroke={color} strokeWidth="2.35" strokeDasharray={curve.pulse_duration_s >= 1000000 ? "7 4" : undefined} points={curve.points.map((point) => `${x(point.vds_v)},${y(point.id_a)}`).join(" ")}/>{curve.points.map((point, pointIndex) => <circle className="soa-sample" key={pointIndex} cx={x(point.vds_v)} cy={y(point.id_a)} r="1.9" fill={color}/>)}</g>; })}
      {safePoint && safePoint.id_a > 0 && <circle className="chart-point safe-point" cx={x(safePoint.vds_v)} cy={y(safePoint.id_a)} r="6"/>}
      <circle className="operating-point-ring" cx={x(input.vds_v)} cy={y(input.id_a)} r="10"/>
      <circle className="chart-point current-point" cx={x(input.vds_v)} cy={y(input.id_a)} r="6.5"/>
      <text className="point-label" x={Math.min(width-right-72, x(input.vds_v)+12)} y={Math.max(top+14, y(input.id_a)-10)}>Betriebspunkt</text>
      <text className="axis-label" x={width-right} y={height-4} textAnchor="end">VDS [V]</text><text className="axis-label" x="12" y={top+4}>ID [A]</text>
    </svg><div className="soa-legend">{curves.map((curve, index) => <span key={curve.pulse_duration_s}><i style={{ background: curveColor(curve.pulse_duration_s, index) }}/>{labelPulse(curve.pulse_duration_s)}</span>)}<span><i className="point current"/>Betriebspunkt</span>{safePoint && <span><i className="point safe"/>Engine-Grenzpunkt</span>}</div></div>
    <div className="chart-note"><Info size={18}/><span>Kurven werden unverändert aus der gespeicherten Engineering-Digitalisierung dargestellt. TransiSafe berechnet im Browser keine SOA-Grenze.</span></div>
  </section>;
}
