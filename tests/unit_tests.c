#include "analysis.h"
#include "database.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

static int failures;
static void check(int value, const char* name)
{ if (!value) { fprintf(stderr, "FAILED: %s\n", name); failures++; } }
static void close_to(double actual, double expected, double tolerance,
    const char* name)
{ check(fabs(actual - expected) <= tolerance, name); }

static TransistorModel model(void)
{
    TransistorModel m = {0};
    m.type = TRANS_MOSFET; m.vds_max = 60; m.id_max = 80;
    m.id_pulse_max = 160; m.id_pulse_duration_max_s = .0001;
    m.t_j_max = 175; m.rth_jc = 1.2; m.rth_ja = 50;
    m.gate_charge_c = 80e-9;
    m.rds_on_curve[0] = (CurvePoint){25, .008};
    m.rds_on_curve[1] = (CurvePoint){125, .016};
    m.rds_on_curve_count = 2;
    m.soa_curves[0].parameter = .001;
    m.soa_curves[0].points[0] = (CurvePoint){1, 60};
    m.soa_curves[0].points[1] = (CurvePoint){10, 20};
    m.soa_curves[0].count = 2; m.soa_curve_count = 1;
    m.zth_curves[0].parameter = .1;
    m.zth_curves[0].points[0] = (CurvePoint){.0001, .08};
    m.zth_curves[0].points[1] = (CurvePoint){.001, .25};
    m.zth_curves[0].count = 2; m.zth_curve_count = 1;
    return m;
}

static OperatingPoint linear_point(const TransistorModel* m)
{
    OperatingPoint p = {0};
    p.model = m; p.vds = 5; p.id = 2; p.mode = MODE_LINEAR;
    p.pulse_duration_s = .001; p.duty_cycle = .1;
    p.temperature_reference = TEMPERATURE_CASE;
    p.reference_temperature_c = 25; p.safety_factor = 1;
    return p;
}

int main(void)
{
    TransistorModel m = model();
    AppConfig config = {10, 10, "", "", "", "", ""};
    OperatingPoint p = linear_point(&m);
    AnalysisResult r;
    TransistorDatabase* db;
    const TransistorModel* real_model;

    db = malloc(sizeof(*db));
    check(db != NULL, "allocate MOSFET database on heap");
    if (db == NULL) return EXIT_FAILURE;

    check(load_transistor_database("transistors.csv", db),
        "load MOSFET master data");
    check(load_mosfet_curves("mosfet_curves.csv", db),
        "load MOSFET curve data");
    check(db->count == 3, "fixture plus two real MOSFETs loaded");
    check(find_transistor_by_id(db, "PSMN1R4-100ASE", &real_model),
        "find Nexperia reference MOSFET");
    check(real_model->id_pulse_max == 2186,
        "preserve separate pulsed current limit");
    close_to(interpolate_rds_on(real_model, 100), .0022, 1e-12,
        "Nexperia table RDS(on) value");
    {
        OperatingPoint real_point = {0};
        AnalysisResult real_result;
        real_point.model = real_model;
        real_point.vds = 48; real_point.id = 30;
        real_point.mode = MODE_LINEAR; real_point.pulse_duration_s = .01;
        real_point.duty_cycle = .02;
        real_point.temperature_reference = TEMPERATURE_CASE;
        real_point.reference_temperature_c = 25;
        real_point.safety_factor = 1;
        real_result = analyze_operating_point(&real_point, &config);
        check(real_result.status == STATUS_NOT_SAFE_SOA,
            "real Nexperia SOA boundary rejects overstress");
    }

    close_to(interpolate_rds_on(&m, 75), .012, 1e-12,
        "linear RDS(on) interpolation");
    close_to(interpolate_soa_current(&m, .001, 10), 20, 1e-12,
        "SOA endpoint");
    close_to(interpolate_zth_jc(&m, .1, .001), .25, 1e-12,
        "Zth endpoint");

    r = analyze_operating_point(&p, &config);
    close_to(r.conduction_loss_w, 1.0, 1e-12,
        "linear average power includes duty cycle");
    close_to(r.t_j, 27.5, 1e-12,
        "linear pulse junction temperature");
    check(r.status == STATUS_SAFE, "safe linear point");

    p.id = 30;
    r = analyze_operating_point(&p, &config);
    check(r.status == STATUS_NOT_SAFE_SOA, "SOA violation");

    p = linear_point(&m); p.vds = 61;
    r = analyze_operating_point(&p, &config);
    check(r.status == STATUS_NOT_SAFE_VOLTAGE, "VDS violation");

    p = linear_point(&m); p.mode = MODE_SWITCHING;
    p.frequency_hz = 100000; p.e_on_j = 10e-6; p.e_off_j = 8e-6;
    p.gate_drive_voltage_v = 10;
    r = analyze_operating_point(&p, &config);
    close_to(r.switching_loss_w, 1.8, 1e-12, "switching energy loss");
    close_to(r.gate_drive_loss_w, .08, 1e-12, "gate drive loss");
    check(r.data_complete, "complete switching inputs");

    p.e_on_j = p.e_off_j = 0;
    r = analyze_operating_point(&p, &config);
    check(r.status == STATUS_INSUFFICIENT_DATA,
        "missing switching energies are explicit");

    free(db);
    if (failures) return EXIT_FAILURE;
    puts("All TransiSafe MOSFET core tests passed.");
    return EXIT_SUCCESS;
}
