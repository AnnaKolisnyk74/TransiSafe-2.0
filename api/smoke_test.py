from io import BytesIO
from zipfile import ZipFile

from api.main import AnalysisRequest, SaveAnalysisRequest, analyze, export_current_analysis, health, models, soa_curves


def main() -> None:
    assert health()["engine_available"] is True
    catalog = models()["models"]
    assert len(catalog) >= 2
    nexperia = next(model for model in catalog if model["id"] == "PSMN1R4-100ASEJ")
    assert nexperia["manufacturer"] == "Nexperia"
    assert nexperia["datasheet_type"] == "PSMN1R4-100ASE"
    assert nexperia["package_name"] == "CCPAK1212 (SOT8000A)"
    assert nexperia["rth_jc_k_per_w"] == 0.16
    assert nexperia["rds_on_25_ohm"] == 0.00136
    assert len(soa_curves("PSMN1R4-100ASEJ")["curves"]) == 6
    infineon = [model for model in catalog if model["manufacturer"] == "Infineon Technologies"]
    assert len(infineon) == 3
    assert {model["id"] for model in infineon} == {"IPB017N10N5", "IPB035N10NF2S", "IPT015N10N5"}
    assert len(soa_curves("IPB017N10N5")["curves"]) == 6
    request = AnalysisRequest(
        transistor_id="CSD19536KTT",
        vds_v=48,
        id_a=40,
        mode="SWITCHING",
        pulse_duration_s=0.00001,
        frequency_hz=100000,
        duty_cycle=0.5,
        temperature_reference="CASE",
        temperature_c=25,
        rth_cs_k_per_w=0,
        rth_sa_k_per_w=0,
        safety_factor=1.2,
        e_on_j=0.00002,
        e_off_j=0.000015,
        gate_drive_voltage_v=10,
    )
    response = analyze(request)
    assert response["result"]["status"] == "SAFE"
    assert 5.5 < response["result"]["p_total_w"] < 5.7
    assert response["result"]["checks"] == {
        "voltage": True,
        "current": True,
        "soa": True,
        "temperature": True,
    }
    for transistor_id in ("IPB017N10N5", "IPB035N10NF2S", "IPT015N10N5"):
        infineon_response = analyze(request.model_copy(update={"transistor_id": transistor_id}))
        assert infineon_response["result"]["status"] != "INSUFFICIENT_DATA"
        assert infineon_response["result"]["rds_on_ohm"] > 0
        assert infineon_response["result"]["soa_limit_a"] > 0
        assert infineon_response["result"]["zth_jc_k_per_w"] > 0
    assert response["schema_version"] == "1.0"
    assert response["result"]["closest_constraint"]["type"] == "VOLTAGE"
    assert response["result"]["margins"]["voltage_reserve_percent"] > 0
    assert response["source"]["verification_status"] == "REVIEW_PENDING"
    assert response["analysis_metadata"]["engine_version"] == "2.1.0"
    export_request = SaveAnalysisRequest(
        name="CSD19536KTT Analysis Report",
        input=request,
        result=response,
        report_config={
            "report_type": "analysis",
            "sections": ["overview", "soa", "losses"],
            "embed_charts": True,
            "embed_3d": True,
            "show_limits": True,
        },
    )
    for format_name in ("pdf", "xlsx", "docx", "json", "csv"):
        exported = export_current_analysis(format_name, export_request)
        content = bytes(exported.body)
        assert exported.status_code == 200
        assert len(content) > 100
        if format_name == "pdf": assert content.startswith(b"%PDF")
        if format_name in ("xlsx", "docx"):
            member = "xl/workbook.xml" if format_name == "xlsx" else "word/document.xml"
            assert member in ZipFile(BytesIO(content)).namelist()
    print("TransiSafe API smoke test passed.")


if __name__ == "__main__":
    main()
