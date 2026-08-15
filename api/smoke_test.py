from api.main import AnalysisRequest, analyze, health, models


def main() -> None:
    assert health()["engine_available"] is True
    assert len(models()["models"]) >= 2
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
    print("TransiSafe API smoke test passed.")


if __name__ == "__main__":
    main()
