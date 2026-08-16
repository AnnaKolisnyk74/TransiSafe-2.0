from __future__ import annotations

import csv
import io
import hashlib
import json
import os
import secrets
import sqlite3
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import Body, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from openpyxl import Workbook, load_workbook
from openpyxl.chart import Reference, ScatterChart, Series
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.graphics.shapes import Circle, Drawing, Line, Rect, String
from reportlab.graphics.charts.piecharts import Pie
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from pydantic import BaseModel, ConfigDict, Field, model_validator


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("TRANSISAFE_DATA_DIR", ROOT / "api" / "data"))
DB_PATH = DATA_DIR / "analyses.sqlite3"
APP_VERSION = "2.1.0"
DATASET_VERSION = "2.1"


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    transistor_id: str = Field(pattern=r"^[A-Za-z0-9_.-]+$", min_length=1, max_length=63)
    vds_v: float = Field(ge=0)
    id_a: float = Field(ge=0)
    mode: Literal["LINEAR", "SWITCHING"]
    pulse_duration_s: float = Field(gt=0)
    frequency_hz: float = Field(ge=0)
    duty_cycle: float = Field(gt=0, le=1)
    temperature_reference: Literal["AMBIENT", "CASE"]
    temperature_c: float = Field(ge=-273.15)
    rth_cs_k_per_w: float = Field(ge=0)
    rth_sa_k_per_w: float = Field(ge=0)
    safety_factor: float = Field(ge=1)
    e_on_j: float = Field(ge=0)
    e_off_j: float = Field(ge=0)
    gate_drive_voltage_v: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_switching_inputs(self) -> "AnalysisRequest":
        if self.mode == "SWITCHING":
            if self.frequency_hz <= 0:
                raise ValueError("frequency_hz must be greater than zero in switching mode")
            if self.e_on_j + self.e_off_j <= 0:
                raise ValueError("Eon or Eoff is required in switching mode")
            if self.gate_drive_voltage_v <= 0:
                raise ValueError("gate-drive voltage is required in switching mode")
        return self

    def to_engine_line(self) -> str:
        values = (
            self.transistor_id,
            self.vds_v,
            self.id_a,
            self.mode,
            self.pulse_duration_s,
            self.frequency_hz,
            self.duty_cycle,
            self.temperature_reference,
            self.temperature_c,
            self.rth_cs_k_per_w,
            self.rth_sa_k_per_w,
            self.safety_factor,
            self.e_on_j,
            self.e_off_j,
            self.gate_drive_voltage_v,
        )
        return ";".join(str(value) for value in values) + "\n"


class SaveAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    input: AnalysisRequest
    result: dict[str, Any]
    parent_id: str | None = None


class BatchRow(BaseModel):
    source_row: int = Field(ge=2)
    analysis_name: str = Field(default="", max_length=160)
    input: AnalysisRequest


class BatchAnalyzeRequest(BaseModel):
    rows: list[BatchRow] = Field(min_length=1, max_length=5000)


class AuthRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    password: str = Field(min_length=8, max_length=200)
    name: str | None = Field(default=None, max_length=120)


def engine_path() -> Path:
    configured = os.getenv("TRANSISAFE_ENGINE")
    candidates = [
        Path(configured) if configured else None,
        ROOT / "build" / "Release" / "transisafe_json.exe",
        ROOT / "build" / "transisafe_json.exe",
        ROOT / "build" / "transisafe_json",
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate
    raise HTTPException(
        status_code=503,
        detail="The C analysis engine is not built. Build the CMake target transisafe_json first.",
    )


def load_models() -> list[dict[str, object]]:
    models: list[dict[str, object]] = []
    metadata: dict[str, dict[str, str]] = {}
    rds_on_25_c: dict[str, float] = {}
    with (ROOT / "component_metadata.csv").open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            metadata[row["transistor_id"]] = row
    with (ROOT / "mosfet_curves.csv").open(encoding="utf-8", newline="") as handle:
        rows = (line for line in handle if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows, delimiter=";"):
            if row["curve_type"] == "RDS_ON" and float(row["x"]) == 25:
                rds_on_25_c[row["transistor_id"]] = float(row["y"])
    with (ROOT / "transistors.csv").open(encoding="utf-8", newline="") as handle:
        rows = (line for line in handle if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows, delimiter=";"):
            presentation = metadata.get(row["transistor_id"], {})
            models.append(
                {
                    "id": row["transistor_id"],
                    "type": row["type"],
                    "vds_max_v": float(row["vds_max"]),
                    "id_continuous_max_a": float(row["id_continuous_max"]),
                    "id_pulse_max_a": float(row["id_pulse_max"]),
                    "tj_max_c": float(row["tj_max"]),
                    "rth_jc_k_per_w": float(row["rth_jc"]),
                    "rds_on_25_ohm": rds_on_25_c.get(row["transistor_id"]),
                    "datasheet_url": row["datasheet_url"],
                    "revision": row["datasheet_revision"],
                    "retrieved_date": row["retrieved_date"],
                    "manufacturer": presentation.get("manufacturer", ""),
                    "datasheet_type": presentation.get("datasheet_type", row["transistor_id"]),
                    "package_name": presentation.get("package_name", ""),
                    "product_url": presentation.get("product_url", ""),
                    "image_path": presentation.get("image_path", ""),
                    "development_fixture": row["transistor_id"] == "ENGINEERING_FIXTURE",
                    "verification_status": "REVIEW_PENDING",
                    "curve_status": "ENGINEERING_DIGITIZATION",
                }
            )
    return models


def load_soa_curves(transistor_id: str) -> list[dict[str, object]]:
    grouped: dict[float, list[dict[str, float]]] = {}
    with (ROOT / "mosfet_curves.csv").open(encoding="utf-8", newline="") as handle:
        rows = (line for line in handle if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows, delimiter=";"):
            if row["transistor_id"] != transistor_id or row["curve_type"] != "SOA":
                continue
            parameter = float(row["parameter"])
            grouped.setdefault(parameter, []).append(
                {"vds_v": float(row["x"]), "id_a": float(row["y"])}
            )
    return [
        {"pulse_duration_s": parameter, "points": sorted(points, key=lambda point: point["vds_v"])}
        for parameter, points in sorted(grouped.items())
    ]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def init_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS analyses (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_id TEXT,
                input_json TEXT NOT NULL,
                result_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        connection.execute("""CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
            password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL
        )""")
        connection.execute("""CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )""")


def password_hash(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000).hex()


def session_user(token: str) -> dict[str, str]:
    init_storage()
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory=sqlite3.Row
        row=connection.execute("SELECT users.id, users.email, users.name FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=?",(token,)).fetchone()
    if row is None: raise HTTPException(status_code=401,detail="Invalid or expired session")
    return dict(row)


def run_engine(request: AnalysisRequest) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            [str(engine_path()), "--transistors", str(ROOT / "transistors.csv"),
             "--curves", str(ROOT / "mosfet_curves.csv")],
            input=request.to_engine_line(), text=True, capture_output=True,
            cwd=ROOT, timeout=10, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail=f"Analysis engine unavailable: {exc}") from exc
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="The analysis engine returned an invalid response.") from exc
    if completed.returncode != 0 or not payload.get("ok"):
        message = payload.get("error", {}).get("message", "Analysis failed")
        raise HTTPException(status_code=422, detail=message)
    payload["analysis_metadata"] = {
        "timestamp": utc_now(), "engine_version": payload.get("source", {}).get("engine_version", APP_VERSION),
        "dataset_version": payload.get("source", {}).get("dataset_version", DATASET_VERSION),
        "application_version": APP_VERSION,
        "warnings": analysis_warnings(payload),
        "assumptions": ["Stored engineering curves are used unchanged by the native C engine."],
        "model_limitations": ["Engineering decision support; not certification or qualification evidence."],
    }
    return payload


def analysis_warnings(payload: dict[str, Any]) -> list[str]:
    result = payload.get("result", {})
    warnings: list[str] = []
    if not result.get("data_complete", False):
        warnings.append("Required engineering data is incomplete; no SAFE classification is permitted.")
    status = str(result.get("status", "UNKNOWN"))
    if status == "CRITICAL": warnings.append("At least one engineering reserve is below the configured critical threshold.")
    if status.startswith("NOT_SAFE"):
        warnings.append(f"Operating point violates the native engine constraint: {result.get('reason', 'UNKNOWN')}.")
    if payload.get("source", {}).get("verification_status") != "VERIFIED":
        warnings.append("Stored engineering digitization is pending independent review.")
    return warnings


def analysis_record(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "name": row["name"], "parent_id": row["parent_id"],
            "input": json.loads(row["input_json"]), "result": json.loads(row["result_json"]),
            "created_at": row["created_at"], "updated_at": row["updated_at"]}


def get_analysis_or_404(analysis_id: str) -> dict[str, Any]:
    init_storage()
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    if row is None: raise HTTPException(status_code=404, detail="Saved analysis not found")
    return analysis_record(row)


def status_fill(status: str) -> PatternFill:
    color = "DDF4E8" if status in {"SAFE", "PASS"} else "FFF1CC" if status in {"CRITICAL", "WARNING"} else "FDE2E5"
    return PatternFill("solid", fgColor=color)


def add_sheet(workbook: Workbook, title: str, rows: list[list[Any]], widths: tuple[int, ...] = (30, 24, 24, 48)):
    sheet = workbook.create_sheet(title)
    for row in rows: sheet.append(row)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0B5CAD")
        cell.alignment = Alignment(vertical="center")
    for index, width in enumerate(widths, 1): sheet.column_dimensions[chr(64 + index)].width = width
    return sheet


def workbook_for_analysis(record: dict[str, Any]) -> bytes:
    payload, inp = record["result"], record["input"]
    result, source = payload["result"], payload["source"]
    meta = payload.get("analysis_metadata", {})
    model = next((item for item in load_models() if item["id"] == inp["transistor_id"]), {})
    workbook = Workbook(); workbook.remove(workbook.active)
    summary = add_sheet(workbook, "SUMMARY", [["Field", "Value", "Unit"],
        ["Analysis ID", record.get("id", "")], ["Analysis Name", record.get("name", "")],
        ["Timestamp", meta.get("timestamp", record.get("created_at", ""))], ["Component / OPN", inp["transistor_id"]],
        ["Manufacturer", model.get("manufacturer", "")], ["Operating Mode", inp["mode"]],
        ["Assessment", result["status"]], ["Closest Constraint", result["closest_constraint"]["type"]],
        ["Closest Reserve", result["closest_constraint"]["reserve_percent"], "%"], ["Tj", result["tj_c"], "°C"],
        ["Thermal Reserve", result["temperature_margin_c"], "K"], ["Total Loss", result["p_total_w"], "W"],
        ["SOA Reserve", result["margins"]["soa_reserve_percent"], "%"],
        ["Voltage Reserve", result["margins"]["voltage_reserve_percent"], "%"],
        ["Current Reserve", result["margins"]["current_reserve_percent"], "%"],
        ["Warnings", " | ".join(meta.get("warnings", []))], ["Data Coverage", "Complete" if result["data_complete"] else "Incomplete"]])
    summary["B8"].fill = status_fill(str(result["status"]))
    add_sheet(workbook, "INPUTS", [["Input", "Value", "Unit"],
        ["VDS", inp["vds_v"], "V"], ["ID", inp["id_a"], "A"], ["Pulse Duration", inp["pulse_duration_s"], "s"],
        ["Duty Cycle", inp["duty_cycle"], "ratio"], ["Frequency", inp["frequency_hz"], "Hz"],
        ["Gate Voltage", inp["gate_drive_voltage_v"], "V"], ["Eon", inp["e_on_j"], "J"], ["Eoff", inp["e_off_j"], "J"],
        ["Temperature", inp["temperature_c"], "°C"], ["Thermal Reference", inp["temperature_reference"], ""],
        ["RθCS", inp["rth_cs_k_per_w"], "K/W"], ["RθSA", inp["rth_sa_k_per_w"], "K/W"], ["Safety Factor", inp["safety_factor"], "×"]])
    checks = result["checks"]
    add_sheet(workbook, "ENGINEERING CHECKS", [["Check", "Input / Assessment", "Engineering Basis", "Limit", "Margin", "Status"],
        ["Voltage", inp["vds_v"], "Native rating check incl. safety factor", source["vds_max_v"], result["margins"]["voltage_reserve_percent"], "PASS" if checks["voltage"] else "FAIL"],
        ["Current", inp["id_a"], "Native applicable current limit", result["current_limit_a"], result["margins"]["current_reserve_percent"], "PASS" if checks["current"] else "FAIL"],
        ["Safe Operating Area", inp["id_a"], "Stored SOA interpolation", result["soa_limit_a"], result["margins"]["soa_reserve_percent"], "PASS" if checks["soa"] else "FAIL"],
        ["Junction Temperature", result["tj_c"], "Native thermal path", source["tj_max_c"], result["temperature_margin_c"], "PASS" if checks["temperature"] else "FAIL"],
        ["Data Coverage", "Complete" if result["data_complete"] else "Incomplete", "Required native model and curves", "Complete", "", "PASS" if result["data_complete"] else "UNKNOWN"]], (24,24,42,18,18,16))
    add_sheet(workbook, "LIMITS", [["Condition", "Engine-provided Limit", "Unit", "Source"],
        [f"At VDS = {inp