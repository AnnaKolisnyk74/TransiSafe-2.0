from __future__ import annotations

import csv
import json
import os
import subprocess
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator


ROOT = Path(__file__).resolve().parents[1]


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
    with (ROOT / "transistors.csv").open(encoding="utf-8", newline="") as handle:
        rows = (line for line in handle if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows, delimiter=";"):
            models.append(
                {
                    "id": row["transistor_id"],
                    "type": row["type"],
                    "vds_max_v": float(row["vds_max"]),
                    "id_continuous_max_a": float(row["id_continuous_max"]),
                    "id_pulse_max_a": float(row["id_pulse_max"]),
                    "tj_max_c": float(row["tj_max"]),
                    "datasheet_url": row["datasheet_url"],
                    "revision": row["datasheet_revision"],
                    "retrieved_date": row["retrieved_date"],
                    "development_fixture": row["transistor_id"] == "ENGINEERING_FIXTURE",
                }
            )
    return models


app = FastAPI(
    title="TransiSafe Analysis API",
    version="0.1.0",
    description="HTTP adapter for the native TransiSafe MOSFET analysis core.",
)

allowed_origins = os.getenv(
    "TRANSISAFE_WEB_ORIGINS", "http://localhost:5173,http://localhost:4173"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, object]:
    available = True
    try:
        path = engine_path()
    except HTTPException:
        available = False
        path = None
    return {"ok": True, "engine_available": available, "engine": path.name if path else None}


@app.get("/api/models")
def models() -> dict[str, object]:
    try:
        return {"models": load_models()}
    except (OSError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Model database error: {exc}") from exc


@app.post("/api/analyze")
def analyze(request: AnalysisRequest) -> dict[str, object]:
    try:
        completed = subprocess.run(
            [
                str(engine_path()),
                "--transistors",
                str(ROOT / "transistors.csv"),
                "--curves",
                str(ROOT / "mosfet_curves.csv"),
            ],
            input=request.to_engine_line(),
            text=True,
            capture_output=True,
            cwd=ROOT,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail=f"Analysis engine unavailable: {exc}") from exc

    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="The analysis engine returned an invalid response.",
        ) from exc

    if completed.returncode != 0 or not payload.get("ok"):
        message = payload.get("error", {}).get("message", "Analysis failed")
        raise HTTPException(status_code=422, detail=message)
    return payload
