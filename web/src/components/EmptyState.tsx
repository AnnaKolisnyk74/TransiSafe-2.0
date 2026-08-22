import { Boxes, CircuitBoard, Gauge, PlayCircle } from "lucide-react";
export function EmptyState() {
  return <section className="analysis-empty"><div className="empty-schematic"><span/><CircuitBoard size={30}/></div><p>READY FOR ANALYSIS</p><h2>Define an operating point</h2><span>The engineering assessment will appear here with limits, margins, losses and source traceability.</span><div><article><Boxes size={17}/><b>1</b><small>Select component</small></article><article><Gauge size={17}/><b>2</b><small>Define operating point</small></article><article><PlayCircle size={17}/><b>3</b><small>Run assessment</small></article></div></section>;
}
