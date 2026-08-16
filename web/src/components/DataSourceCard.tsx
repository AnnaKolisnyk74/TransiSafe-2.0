import { ShieldCheck } from "lucide-react";
import type { AnalysisResponse, ModelSummary } from "../types";
import { formatDate } from "./format";

export function DataSourceCard({ result, model }: { result: AnalysisResponse; model: ModelSummary }) {
  return <section className="result-card data-source data-source-strip"><header><div><span>Datenquelle / Traceability</span></div><ShieldCheck size={17}/></header><div className="traceability-items"><article><span>Product / OPN</span><b>{result.input.transistor_id}</b></article><article><span>Hersteller</span><b>{model.manufacturer}</b></article><article><span>Datenblatt</span><a href={model.datasheet_url} target="_blank" rel="noreferrer">{result.source.revision}</a></article><article><span>Datenstatus</span><b className={result.source.verification_status === "VERIFIED" ? "verified" : "review-pending"}>{result.source.verification_status === "VERIFIED" ? "Verifiziert" : "Review ausstehend"}</b></article><article><span>Abgerufen</span><b>{formatDate(result.source.retrieved_date)}</b></article></div></section>;
}
