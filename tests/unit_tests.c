#include "analysis.h"
#include "database.h"
#include "statistics.h"
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
    m.id_pulse_duty_max = .01;
    m.soa_reference_temperature_c = 25;
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

    check(analyze_operating_point(NULL, &config).status ==
        STATUS_INSUFFICIENT_DATA, "null operating point is rejected safely");

    db = malloc(sizeof(*db));
    check(db != NULL, "allocate MOSFET database on heap");
    if (db == NULL) return EXIT_FAILURE;

    check(load_transistor_database("transistors.csv", db),
        "load MOSFET master data");
    check(load_mosfet_curves("mosfet_curves.csv", db),
        "load MOSFET curve data");
    check(db->count == 6, "fixture plus five real MOSFETs loaded");
    check(find_transistor_by_id(db, "PSMN1R4-100ASEJ", &real_model),
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
    check(find_transistor_by_id(db, "IPB017N10N5", &real_model),
        "find Infineon 7-pin reference MOSFET");
    check(real_model->id_max == 273 && real_model->rth_jc == 0.4,
        "load Infineon master ratings");

    close_to(interpolate_rds_on(&m, 75), .012, 1e-12,
        "linear RDS(on) interpolation");
    {
        TransistorModel cold_model = m;
        cold_model.rds_on_curve[0] = (CurvePoint){-40, .006};
        cold_model.rds_on_curve[1] = (CurvePoint){25, .008};
        close_to(interpolate_rds_on(&cold_model, -7.5), .007, 1e-12,
            "RDS(on) interpolation supports negative temperatures");
        cold_model.rds_on_curve[1].x = -40;
        check(interpolate_rds_on(&cold_model, -40) < 0.0,
            "duplicate curve coordinates are rejected");
    }
    close_to(interpolate_soa_current(&m, .001, 10), 20, 1e-12,
        "SOA endpoint");
    close_to(interpolate_zth_jc(&m, .1, .001), .25, 1e-12,
        "Zth endpoint");
    check(interpolate_zth_jc(&m, .2, .001) < 0.0,
        "reject unsupported Zth duty cycle");
    close_to(interpolate_zth_jc(&m, 1.0, .001), m.rth_jc, 1e-12,
        "continuous operation uses steady-state RthJC");

    r = analyze_operating_point(&p, &config);
    close_to(r.conduction_loss_w, 1.0, 1e-12,
        "linear average power includes duty cycle");
    close_to(r.t_j, 27.5, 1e-12,
        "linear pulse junction temperature");
    check(r.status == STATUS_SAFE, "safe linear point");
    close_to(r.voltage_reserve_percent, 100.0 * (1.0 - 5.0 / 60.0),
        1e-9, "native voltage reserve is returned");
    close_to(r.current_reserve_percent, 97.5, 1e-9,
        "native current reserve is returned");
    check(r.closest_constraint[0] != '\0',
        "native closest constraint is returned");

    p.reference_temperature_c = 50;
    r = analyze_operating_point(&p, &config);
    check(r.status == STATUS_INSUFFICIENT_DATA,
        "do not invent SOA derating above the stored curve temperature");

    p = linear_point(&m); p.id = 100; p.pulse_duration_s = .0001;
    p.duty_cycle = .02;
    r = analyze_operating_point(&p, &config);
    check(!r.safe_current, "pulsed current requires permitted duty cycle");

    p = linear_point(&m); p.id = 30;
    r = analyze_operating_point(&p, &config);
    check(r.status == STATUS_NOT_SAFE_SOA, "SOA violation");
    {
        OptimizationResult optimization = calculate_optimization(&p, &r);
        check(optimization.max_voltage_v < m.vds_max,
            "voltage recommendation respects SOA, not only VDSmax");
        check(optimization.max_current_a < m.id_max,
            "current recommendation respects SOA and temperature");
    }

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

    {
        OperatingPoint pulse_point = {0};
        AnalysisResult pulse_result;
        check(find_transistor_by_id(db, "CSD19536KTT", &real_model),
            "find TI reference MOSFET");
        pulse_point.model = real_model;
        pulse_point.vds = 1; pulse_point.id = 390;
        pulse_point.mode = MODE_LINEAR; pulse_point.pulse_duration_s = 10e-6;
        pulse_point.duty_cycle = 1;
        pulse_point.temperature_reference = TEMPERATURE_CASE;
        pulse_point.reference_temperature_c = 25;
        pulse_point.safety_factor = 1;
        pulse_result = analyze_operating_point(&pulse_point, &config);
        check(pulse_result.status == STATUS_NOT_SAFE_CURRENT,
            "TI 400 A pulse limit is unavailable above one percent duty");
        close_to(pulse_result.zth_jc_k_per_w, real_model->rth_jc, 1e-12,
            "DC thermal boundary does not clamp to 50 percent Zth");
        close_to(pulse_result.t_j, 181, 1e-9,
            "DC linear point uses steady-state RthJC");
    }

    {
        StatisticsResult statistics;
        OperatingPoint stats_point = linear_point(&m);
        AnalysisResult stats_result = analyze_operating_point(&stats_point,
            &config);
        initialize_statistics(&statistics);
        stats_result.status = STATUS_NOT_SAFE_SOA;
        update_statistics(&statistics, 1, &stats_point, &stats_result);
        check(statistics.not_safe_soa_count == 1,
            "SOA failures have a dedicated statistics category");
        check(statistics.not_safe_both_count == 0,
            "SOA failures are not reported as power and temperature");
    }

    free(db);
    if (failures) return EXIT_FAILURE;
    puts("All TransiSafe MOSFET core tests passed.");
    return EXIT_SUCCESS;
}
