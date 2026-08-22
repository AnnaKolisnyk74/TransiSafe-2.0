import { Activity, ArrowDown, BookOpenCheck, Flame, Gauge, ShieldAlert, Thermometer, Zap } from "lucide-react";
import { useState } from "react";

type LabTopic = "gate" | "switching" | "current" | "loss" | "heat";

const topics: Array<{ id: LabTopic; step: string; title: string; summary: string; icon: typeof Zap }> = [
  { id: "gate", step: "01 · GATE SIGNAL", title: "Electric field & channel", summary: "See how VGS controls channel formation without implying literal electron trajectories.", icon: Zap },
  { id: "switching", step: "02 · MOSFET SWITCHING", title: "Voltage-current transition", summary: "Explore turn-on and turn-off before following the resulting current path.", icon: Activity },
  { id: "current", step: "03 · CURRENT FLOW", title: "Channel & body diode", summary: "Distinguish conventional Drain→Source current from reverse body-diode conduction.", icon: ArrowDown },
  { id: "loss", step: "04 · POWER LOSS", title: "Switching overlap & RDS(on)", summary: "Connect transition overlap and temperature-sensitive on-resistance to loss.", icon: Thermometer },
  { id: "heat", step: "05 · HEAT FLOW", title: "SOA, avalanche & thermal path", summary: "Connect electrical stress, transient energy and the junction-to-reference heat path.", icon: ShieldAlert },
];

export function MosfetLab() {
  const [topic, setTopic] = useState<LabTopic>("gate");
  const [control, setControl] = useState(62);
  const [systemDrive, setSystemDrive] = useState(68);
  const selected = topics.find((item) => item.id === topic)!;
  const selectedIndex = topics.findIndex((item) => item.id === topic);
  const chooseTopic = (next: LabTopic) => { setTopic(next); setControl(next === "gate" ? 62 : 50); };
  return <main className="lab-workspace" id="top">
    <div className="workspace-context"><span>LAB</span><p>Gate Signal <i>→</i> MOSFET Switching <i>→</i> Current Flow <i>→</i> Power Loss <i>→</i> Heat Flow</p><b>Conceptual · interactive · engineering-honest</b></div>
    <section className="lab-hero">
      <div><span><BookOpenCheck size={15}/> MOSFET PHYSICS LAB</span><h1>From gate command to junction heat</h1><p>Compact learning modules that explain the physical chain behind a power-MOSFET operating point. Use them to build intuition, then validate the real component with TransiSafe analysis and its datasheet.</p></div>
      <aside><Gauge size={24}/><strong>C-Engine remains the source of truth</strong><span>The Lab does not recalculate limits or analysis results.</span></aside>
    </section>
    <section className="lab-flow" aria-label="MOSFET energy flow">{topics.map((item, index) => <button type="button" className={topic === item.id ? "active" : ""} onClick={() => chooseTopic(item.id)} key={item.id}><small>{item.step}</small><b>{item.title}</b>{index < topics.length - 1 && <i>→</i>}</button>)}</section>
    <section className="lab-system-demo" aria-label="Interactive MOSFET cause and effect chain"><header><div><small>INTERACTIVE SYSTEM VIEW</small><strong>One control, the complete physical chain</strong></div><label><span>Normalized gate command</span><input type="range" min="0" max="100" value={systemDrive} onChange={(event) => setSystemDrive(Number(event.target.value))}/><b>{systemDrive} %</b></label></header><div className="lab-system-chain"><article className={systemDrive > 12 ? "active" : ""}><small>01</small><b>Gate signal</b><span>{systemDrive}% command</span></article><i>→</i><article className={systemDrive > 38 ? "active" : ""}><small>02</small><b>Channel state</b><span>{systemDrive > 38 ? "available" : "depleted"}</span></article><i>→</i><article className={systemDrive > 48 ? "active" : ""}><small>03</small><b>Current flow</b><span>{systemDrive > 48 ? "D → S" : "blocked"}</span></article><i>→</i><article className={systemDrive > 48 ? "active warm" : ""}><small>04</small><b>Power loss</b><span>{systemDrive > 48 ? "conduction + transitions" : "gate only"}</span></article><i>→</i><article className={systemDrive > 48 ? "active hot" : ""}><small>05</small><b>Heat flow</b><span>{systemDrive > 48 ? "junction → reference" : "minimal"}</span></article></div><p>This is a normalized cause-and-effect teaching view—not a real-time calculation. Actual values remain in Analyze and come from the C engine.</p></section>
    <section className="lab-content">
      <nav aria-label="Learning modules">{topics.map((item) => { const Icon = item.icon; return <button type="button" className={topic === item.id ? "active" : ""} onClick={() => chooseTopic(item.id)} key={item.id}><Icon size={18}/><span><small>{item.step}</small><b>{item.title}</b><em>{item.summary}</em></span></button>; })}</nav>
      <article className={`lab-module lab-${topic}`}>
        <header><div><small>{selected.step}</small><h2>{selected.title}</h2></div><span>CONCEPT MODEL</span></header>
        <div className="lab-interactive">
          <LabVisual topic={topic} control={control}/>
          <label><span>{topic === "gate" ? "Gate command VGS" : topic === "switching" ? "Transition speed" : topic === "current" ? "Current direction" : topic === "loss" ? "Junction temperature" : "Stress level"}</span><input type="range" min="0" max="100" value={control} onChange={(event) => setControl(Number(event.target.value))}/><b>{control} %</b></label>
        </div>
        <LabExplanation topic={topic} control={control}/>
        <footer className="lab-module-navigation"><button type="button" disabled={selectedIndex === 0} onClick={() => chooseTopic(topics[selectedIndex - 1].id)}>← Previous principle</button><span>{selectedIndex + 1} / {topics.length}</span><button type="button" disabled={selectedIndex === topics.length - 1} onClick={() => chooseTopic(topics[selectedIndex + 1].id)}>Next principle →</button></footer>
      </article>
    </section>
    <section className="lab-integrity"><Flame size={18}/><div><strong>What this Lab deliberately does not claim</strong><p>No real-time semiconductor simulation, no electron-by-electron paths, and no exact manufacturer die or package geometry. Waveforms and diagrams are normalized concept models. Component values, losses, SOA checks and temperature remain outputs of the native C11 engine.</p></div></section>
  </main>;
}

function LabVisual({ topic, control }: { topic: LabTopic; control: number }) {
  if (topic === "gate") return <div className="lab-gate-visual"><span className="lab-gate-electrode">GATE</span><i style={{ opacity: .18 + control / 122 }}/><div className={control > 45 ? "formed" : ""}><b>D</b><em>controlled channel</em><b>S</b></div><small>{control > 45 ? "Channel available" : "Channel depleted"}</small></div>;
  if (topic === "switching") { const overlap = 18 + (100 - control) * .48; return <div className="lab-overlap-visual"><svg viewBox="0 0 420 170" preserveAspectRatio="none"><path className="vds" d="M10 25 L145 25 L245 140 L410 140"/><path className="id" d="M10 140 L145 140 L245 25 L410 25"/><rect x="145" y="20" width={overlap} height="125"/><text x="154" y="88">VDS × ID overlap</text></svg><div><span><i/>VDS</span><span><i/>ID</span><b>{control > 62 ? "shorter transition" : "wider overlap"}</b></div></div>; }
  if (topic === "current") return <div className={`lab-diode-visual ${control < 50 ? "reverse" : "forward"}`}><b>D</b><span>↓ <small>conventional current</small></span><i>▷|</i><span>↑ <small>body-diode path</small></span><b>S</b></div>;
  if (topic === "loss") return <div className="lab-temp-visual"><div className="lab-temp-axis"><i style={{ width: `${control}%` }}/><span>25 °C</span><span>Tj rising</span></div><strong style={{ transform: `scale(${.82 + control / 350})` }}>RDS(on)</strong><p>Higher junction temperature generally raises on-resistance; use the datasheet curve for the actual device factor.</p></div>;
  return <div className="lab-limits-visual"><div className="lab-soa-field"><i style={{ left: `${10 + control * .72}%`, top: `${82 - control * .62}%` }}/><span>SOA boundary</span></div><div className="lab-thermal-chain"><b>Junction</b><i>→</i><b>Die attach</b><i>→</i><b>Package</b><i>→</i><b>Case / ambient</b></div></div>;
}

function LabExplanation({ topic, control }: { topic: LabTopic; control: number }) {
  const copy: Record<LabTopic, [string, string, string]> = {
    gate: ["Field controls conductivity", "VGS establishes an electric field through the insulated gate. Above the device threshold, a conductive inversion channel can form between source and drain.", control > 45 ? "The concept view shows an available channel—not a resistance value." : "Below the conceptual threshold, the channel is shown depleted."],
    switching: ["Switching changes voltage and current together", "During turn-on and turn-off, VDS and ID change over a finite interval. Their overlap is shown conceptually here before the next module follows the current path.", control > 62 ? "Conceptually shorter transition selected." : "Conceptually wider transition selected."],
    current: ["Direction matters", "Normal N-channel operation uses conventional current from Drain to Source. Reverse current can use the intrinsic body diode, subject to its forward voltage and recovery behavior.", control < 50 ? "Reverse-current path emphasized." : "Forward channel-current direction emphasized."],
    loss: ["Loss connects switching and temperature", "Switching overlap contributes Eon/Eoff loss, while RDS(on) commonly rises with junction temperature and affects I²R conduction loss. Analyze uses the stored device data and supplied energies.", "This qualitative view does not invent a temperature coefficient or recalculate power."],
    heat: ["One operating point, several constraints", "SOA combines voltage, current and pulse duration. Avalanche adds transient energy stress. Heat then travels from junction through attach and package to the chosen case or ambient reference.", control > 75 ? "High conceptual stress: consult SOA and avalanche ratings." : "Move the point and observe its relationship to the conceptual boundary."],
  };
  const [title, body, note] = copy[topic];
  return <div className="lab-explanation"><span>PHYSICS NOTE</span><h3>{title}</h3><p>{body}</p><small>{note}</small></div>;
}
