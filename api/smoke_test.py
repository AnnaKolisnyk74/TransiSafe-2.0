from api.main import AnalysisRequest, analyze, health, models, soa_curves


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
    assert response["schema_version"] == "1.0"
    assert response["result"]["closest_constraint"]["type"] == "VOLTAGE"
    assert response["result"]["margins"]["voltage_reserve_percent"] > 0
    assert response["source"]["verification_status"] == "REVIEW_PENDING"
    assert response["analysis_metadata"]["engine_version"] == "2.1.0"
    print("TransiSafe API smoke test passed.")


if __name__ == "__main__":
    main()
