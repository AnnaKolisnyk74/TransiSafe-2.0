import { Activity, RadioTower } from "lucide-react";
import type { Mode } from "../types";
export function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return <article className="workflow-card mode-card"><div className="workflow-heading"><span>2</span><h2>Modus</h2><Activity size={16}/></div><div className="mode-options"><button className={mode === "SWITCHING" ? "active" : ""} onClick={() => onChange("SWITCHING")} type="button"><RadioTower size={22}/><b>Switching</b><span>Conduction + Switching + Gate Losses</span></button><button className={mode === "LINEAR" ? "active" : ""} onClick={() => onChange("LINEAR")} type="button"><Activity size={22}/><b>Linear</b><span>SOA + Thermal Operating Point</span></button></div></article>;
}
