import { BarChart3, Boxes, FileText, FlaskConical, Layers3, PanelLeftClose, PanelLeftOpen, SearchCheck, SlidersHorizontal } from "lucide-react";
import type { WorkspacePage } from "../types";
const destinations = [
  { label: "Analyze", page: "analyze", icon: SearchCheck, enabled: true }, { label: "Compare", icon: Layers3 },
  { label: "Optimize", icon: SlidersHorizontal }, { label: "Batch", page: "batch", icon: BarChart3, enabled: true },
  { label: "Components", icon: Boxes }, { label: "Reports", page: "reports", icon: FileText, enabled: true },
];
export function Navigation({ collapsed, onToggle, page, onNavigate }: { collapsed: boolean; onToggle: () => void; page: WorkspacePage; onNavigate: (page: WorkspacePage) => void }) {
  return <aside className="navigation"><div className="nav-logo"><img src="/transisafe-symbol-transparent.png" onError={(event) => { event.currentTarget.src = "/transisafe-mark.png"; }} alt="TransiSafe Symbol"/><button className="nav-toggle" type="button" onClick={onToggle} aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"} aria-expanded={!collapsed} title={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button></div><nav aria-label="Produktbereiche">{destinations.map(({ label, page: destination, icon: Icon, enabled }) => <button key={label} className={destination === page ? "active" : ""} disabled={!enabled} onClick={() => destination && onNavigate(destination as WorkspacePage)} title={collapsed ? label : !enabled ? `${label} – spätere Phase` : undefined}><Icon size={17}/><span>{label}</span>{!enabled && <small>planned</small>}</button>)}</nav><div className="nav-engine"><FlaskConical size={17}/><div><b>Native C11 Engine</b><span>Single source of calculation</span></div></div></aside>;
}
