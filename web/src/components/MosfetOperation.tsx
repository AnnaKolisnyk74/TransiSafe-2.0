import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AnalysisResponse } from "../types";
import { formatNumber } from "./format";

type Phase = "TURN ON" | "ON" | "TURN OFF" | "OFF";

function phaseAt(progress: number, duty: number): Phase {
  const start = .08; const edge = .08; const turnOffStart = Math.min(.84, start + duty);
  if (progress < start) return "OFF";
  if (progress < start + edge) return "TURN ON";
  if (progress < turnOffStart) return "ON";
  if (progress < turnOffStart + edge) return "TURN OFF";
  return "OFF";
}

const WAVE_LEFT = 12;
const WAVE_WIDTH = 568;

function waveformGeometry(duty: number) {
  const rise = WAVE_WIDTH * .08;
  const startX = WAVE_LEFT + WAVE_WIDTH * .08;
  const fallX = WAVE_LEFT + WAVE_WIDTH * Math.min(.84, .08 + duty);
  return { rise, startX, fallX, turnOnX: startX + rise * .5, turnOffX: fallX + rise * .5 };
}

function waveformPath(kind: "gate" | "current" | "drain", duty: number) {
  const left = WAVE_LEFT; const width = WAVE_WIDTH; const top = 8; const bottom = 52;
  const { rise, startX, fallX } = waveformGeometry(duty);
  const delay = kind === "current" ? rise * .18 : 0;
  if (kind === "drain") return `M${left},${top} L${startX},${top} L${startX + rise},${bottom} L${fallX},${bottom} L${fallX + rise},${top} L${left + width},${top}`;
  return `M${left},${bottom} L${startX + delay},${bottom} L${startX + rise + delay},${top} L${fallX + delay},${top} L${fallX + rise + delay},${bottom} L${left + width},${bottom}`;
}

function powerPeakPath(duty: number, filled = false) {
  const { rise, startX, fallX } = waveformGeometry(duty);
  const baseline = 91; const peak = 19;
  const onStart = startX; const onPeak = startX + rise * .66; const onEnd = startX + rise * 1.34;
  const offStart = fallX; const offPeak = fallX + rise * .66; const offEnd = fallX + rise * 1.34;
  const curve = `M${WAVE_LEFT},${baseline} L${onStart},${baseline} C${onStart + rise * .18},${baseline} ${onPeak - rise * .22},${peak} ${onPeak},${peak} C${onPeak + rise * .22},${peak} ${onEnd - rise * .18},${baseline} ${onEnd},${baseline} L${offStart},${baseline} C${offStart + rise * .18},${baseline} ${offPeak - rise * .22},${peak + 5} ${offPeak},${peak + 5} C${offPeak + rise * .22},${peak + 5} ${offEnd - rise * .18},${baseline} ${offEnd},${baseline} L${WAVE_LEFT + WAVE_WIDTH},${baseline}`;
  return filled ? `${curve} L${WAVE_LEFT},${baseline} Z` : curve;
}

export function MosfetOperation({ result }: { result: AnalysisResponse }) {
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const lastFrame = useRef<number | null>(null);
  const duty = result.input.mode === "SWITCHING" ? Math.min(.94, Math.max(.06, result.input.duty_cycle)) : .82;
  const phase = phaseAt(progress, duty);
  const transition = phase === "TURN ON" || phase === "TURN OFF";
  const conducting = phase === "ON" || transition;
  const cursorX = WAVE_LEFT + WAVE_WIDTH * progress;
  const { turnOnX, turnOffX } = waveformGeometry(duty);
  const turnOffStart = Math.min(.84, .08 + duty);
  const leadingOff = progress < .08;
  const trailingOff = phase === "OFF" && !leadingOff;
  const phaseColumns = `${.08}fr ${.08}fr ${Math.max(.02, turnOffStart - .16)}fr ${.08}fr ${Math.max(.02, 1 - turnOffStart - .08)}fr`;

  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => {
    if (!playing) { lastFrame.current = null; return; }
    let frame = 0;
    const tick = (now: number) => {
      if (lastFrame.current !== null) {
        progressRef.current = (progressRef.current + (now - lastFrame.current) / 12000) % 1;
        setProgress(progressRef.current);
      }
      lastFrame.current = now; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); lastFrame.current = null; };
  }, [playing]);

  const phaseClass = phase.toLowerCase().replaceAll(" ", "-");
  return <div className={`mosfet-operation ${phaseClass}`}>
    <div className="operation-stage">
      <div className="operation-flow-labels"><span>Gate signal</span><i>→</i><span>MOSFET switching</span><i>→</i><span>Current flow</span><i>→</i><span>Loss + heat</span></div>
      <div className="operation-device">
        <div className={`operation-gate ${conducting ? "energized" : ""}`}><small>GATE · VGS</small><strong>{formatNumber(result.input.gate_drive_voltage_v, 1)} V</strong></div>
        <svg className={`operation-mosfet-symbol ${conducting ? "conducting" : "blocking"}`} viewBox="0 0 170 230" aria-label="N-channel power MOSFET circuit symbol"><defs><marker id="operation-current-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z"/></marker></defs><text x="87" y="13">D · DRAIN</text><path className="terminal" d="M90 20 V60 M90 170 V210"/><path className="channel" d="M90 64 V94 M90 100 V130 M90 136 V166"/><path className="gate" d="M60 58 V172 M8 115 H60"/><path className="body" d="M90 115 H121 V166 H90"/><path className="diode" d="M121 83 V141 M109 127 H133 M109 101 L133 127 H109 Z"/><path className="current" d="M154 48 V178" markerEnd="url(#operation-current-arrow)"/><text className="current-text" x="138" y="42">ID</text><text x="87" y="225">S · SOURCE</text></svg>
        <div className={`operation-heat ${conducting ? "active" : ""}`}><div><span>ID: Drain → Source</span><small>technischer Strom</small></div><div><span>e⁻: Source → Drain</span><small>Elektronenfluss</small></div></div>
      </div>
      <div className="operation-symbol-legend" aria-label="Physikalische MOSFET-Legende"><span className="gate"><i/><b>Gate-Feld</b><small>bildet den leitenden Kanal</small></span><span className="channel"><i/><b>Inversionskanal</b><small>leitet bei VGS &gt; Vth</small></span><span className="diode"><i/><b>Body-Diode</b><small>intrinsischer p-n-Pfad</small></span><span className="current"><i/><b>Stromrichtung</b><small>ID: D→S, Elektronen: S→D</small></span></div>
      <div className="operation-readouts">
        <span><small>VDS</small><b>{formatNumber(result.input.vds_v, 2)} V</b></span><span><small>VGS</small><b>{formatNumber(result.input.gate_drive_voltage_v, 2)} V</b></span><span><small>ID</small><b>{formatNumber(result.input.id_a, 2)} A</b></span><span><small>fSW</small><b>{formatNumber(result.input.frequency_hz / 1000, 1)} kHz</b></span>
      </div>
    </div>
    <div className="operation-signals">
      <div className="operation-signals-heading"><div><strong>Synchronized switching waveforms</strong><small>VGS changes → ID / VDS overlap → instantaneous power peak</small></div><div className="operation-equation" aria-label="P of t equals V D S of t times I D of t"><i>P</i>(<i>t</i>) = <i>V</i><sub>DS</sub>(<i>t</i>) · <i>I</i><sub>D</sub>(<i>t</i>)</div></div>
      <div className="operation-phase"><strong>{phase}</strong><span>{conducting ? "Conventional current: Drain → Source" : "Channel blocks drain current"}</span></div>
      <div className="operation-phase-track" style={{ gridTemplateColumns: phaseColumns }}><span className={leadingOff ? "active" : ""}>OFF</span><span className={phase === "TURN ON" ? "active" : ""}>TURN ON</span><span className={phase === "ON" ? "active" : ""}>ON</span><span className={phase === "TURN OFF" ? "active" : ""}>TURN OFF</span><span className={trailingOff ? "active" : ""}>OFF</span></div>
      <div className="operation-transition-note"><span>TURN ON</span><i></i><p><b>Switching transition</b><small>VDS falls while ID rises</small></p><i></i><span>TURN OFF</span></div>
      {(["gate", "current", "drain"] as const).map((kind) => <div className={`operation-wave ${kind}`} key={kind}><span>{kind === "gate" ? "VGS" : kind === "current" ? "ID" : "VDS"}</span><svg viewBox="0 0 600 60" preserveAspectRatio="none" aria-label={`${kind} normalized waveform`}><line className="transition-marker" x1={turnOnX} x2={turnOnX} y1="3" y2="57"/><line className="transition-marker" x1={turnOffX} x2={turnOffX} y1="3" y2="57"/><path d={waveformPath(kind, duty)}/><line className="cycle-cursor" x1={cursorX} x2={cursorX} y1="3" y2="57"/></svg></div>)}
      <div className="operation-power-wave"><div className="operation-power-label"><span>P(t)</span><small>normalized instantaneous power</small></div><svg viewBox="0 0 600 108" preserveAspectRatio="none" aria-label="Normalized instantaneous power waveform with switching energy regions"><defs><linearGradient id="operation-power-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c33b32" stopOpacity=".34"/><stop offset="1" stopColor="#c33b32" stopOpacity=".03"/></linearGradient></defs><line className="transition-marker" x1={turnOnX} x2={turnOnX} y1="4" y2="101"/><line className="transition-marker" x1={turnOffX} x2={turnOffX} y1="4" y2="101"/><path className="power-area" d={powerPeakPath(duty, true)}/><path className="power-line" d={powerPeakPath(duty)}/><g className="power-energy-label" transform={`translate(${Math.max(10, turnOnX - 24)} 8)`}><text>Eon · {formatNumber(result.input.e_on_j * 1e6, 1)} µJ</text></g><g className="power-energy-label" transform={`translate(${Math.min(490, turnOffX - 25)} 13)`}><text>Eoff · {formatNumber(result.input.e_off_j * 1e6, 1)} µJ</text></g><line className="cycle-cursor" x1={cursorX} x2={cursorX} y1="3" y2="102"/></svg></div>
      <div className="operation-overlap-key"><i/><span><b>Why switching loss occurs</b><small>At both orange transition markers, VDS and ID coexist briefly. Their overlap contributes switching energy; the displayed loss remains the C-engine result.</small></span><strong>{formatNumber(result.result.p_switching_w, 3)} W</strong></div>
      <div className="operation-loss-focus"><span className={phase === "ON" ? "active" : ""}>Conduction <b>{formatNumber(result.result.p_conduction_w, 3)} W</b></span><span className={transition ? "active" : ""}>Switching <b>{formatNumber(result.result.p_switching_w, 3)} W</b></span><span className={transition ? "active" : ""}>Gate drive <b>{formatNumber(result.result.p_gate_w, 3)} W</b></span></div>
      <div className="operation-controls"><button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Animation pausieren" : "Animation starten"}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button><input type="range" min="0" max="1000" value={Math.round(progress * 1000)} aria-label="Schaltzyklusposition" onChange={(event) => { const next = Number(event.target.value) / 1000; progressRef.current = next; setProgress(next); }}/><b>{formatNumber(progress * 100, 1)} %</b></div>
    </div>
    <p className="operation-disclaimer">Normalized explanatory waveforms only. Operating point, losses and temperature are displayed exclusively from the AnalysisResponse produced by the native C engine.</p>
  </div>;
}
