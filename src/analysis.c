#include "analysis.h"

#include <math.h>
#include <string.h>

static double interpolate(const CurvePoint* points, int count, double x,
    int logarithmic)
{
    int i;
    if (!points || count <= 0 || (logarithmic && x <= 0.0)) return -1.0;
    for (i = 0; i < count; ++i) {
        if ((logarithmic && (points[i].x <= 0.0 || points[i].y <= 0.0)) ||
            (i > 0 && points[i].x <= points[i - 1].x)) return -1.0;
    }
    if (x <= points[0].x) return points[0].y;
    if (x >= points[count - 1].x) return points[count - 1].y;
    for (i = 0; i < count - 1; ++i) {
        if (x >= points[i].x && x <= points[i + 1].x) {
            double ratio;
            if (logarithmic) {
                double lx = log(x), lx0 = log(points[i].x);
                double lx1 = log(points[i + 1].x);
                ratio = (lx - lx0) / (lx1 - lx0);
                return exp(log(points[i].y) + ratio *
                    (log(points[i + 1].y) - log(points[i].y)));
            }
            ratio = (x - points[i].x) /
                (points[i + 1].x - points[i].x);
            return points[i].y + ratio *
                (points[i + 1].y - points[i].y);
        }
    }
    return -1.0;
}

static double parameterized_interpolate(const ParameterizedCurve* curves,
    int count, double parameter, double x)
{
    int i;
    if (!curves || count <= 0 || parameter < 0.0) return -1.0;
    /* A parameter >= 1e8 is the explicit DC SOA curve sentinel. */
    if (count > 1 && curves[count - 1].parameter >= 1e8 &&
        parameter > curves[count - 2].parameter)
        return interpolate(curves[count - 1].points,
            curves[count - 1].count, x, 1);
    if (parameter <= curves[0].parameter)
        return interpolate(curves[0].points, curves[0].count, x, 1);
    if (parameter >= curves[count - 1].parameter)
        return interpolate(curves[count - 1].points,
            curves[count - 1].count, x, 1);
    for (i = 0; i < count - 1; ++i) {
        if (parameter >= curves[i].parameter &&
            parameter <= curves[i + 1].parameter) {
            double y0 = interpolate(curves[i].points, curves[i].count, x, 1);
            double y1 = interpolate(curves[i + 1].points,
                curves[i + 1].count, x, 1);
            double ratio;
            if (y0 <= 0.0 || y1 <= 0.0) return -1.0;
            if (curves[i].parameter > 0.0 && parameter > 0.0) {
                ratio = (log(parameter) - log(curves[i].parameter)) /
                    (log(curves[i + 1].parameter) -
                     log(curves[i].parameter));
            } else {
                ratio = (parameter - curves[i].parameter) /
                    (curves[i + 1].parameter - curves[i].parameter);
            }
            return exp(log(y0) + ratio * (log(y1) - log(y0)));
        }
    }
    return -1.0;
}

double interpolate_rds_on(const TransistorModel* model, double temperature_c)
{
    return interpolate(model->rds_on_curve, model->rds_on_curve_count,
        temperature_c, 0);
}

double interpolate_soa_current(const TransistorModel* model,
    double pulse_duration_s, double vds)
{
    return parameterized_interpolate(model->soa_curves,
        model->soa_curve_count, pulse_duration_s, vds);
}

double interpolate_zth_jc(const TransistorModel* model,
    double duty_cycle, double pulse_duration_s)
{
    if (!model || model->zth_curve_count <= 0 || duty_cycle < 0.0 ||
        duty_cycle > 1.0) return -1.0;
    if (duty_cycle == 1.0) return model->rth_jc;
    if (duty_cycle < model->zth_curves[0].parameter ||
        duty_cycle > model->zth_curves[model->zth_curve_count - 1].parameter)
        return -1.0;
    return parameterized_interpolate(model->zth_curves,
        model->zth_curve_count, duty_cycle, pulse_duration_s);
}

static double applicable_current_limit(const OperatingPoint* point)
{
    const TransistorModel* model = point->model;
    int pulse_conditions_apply = model->id_pulse_duty_max > 0.0 &&
        point->pulse_duration_s <= model->id_pulse_duration_max_s &&
        point->duty_cycle <= model->id_pulse_duty_max;
    return pulse_conditions_apply ? model->id_pulse_max : model->id_max;
}

static SafetyStatus classify(const AnalysisResult* r,
    const AppConfig* config)
{
    if (!r->data_complete) return STATUS_INSUFFICIENT_DATA;
    if (!r->safe_voltage) return STATUS_NOT_SAFE_VOLTAGE;
    if (!r->safe_current) return STATUS_NOT_SAFE_CURRENT;
    if (!r->safe_soa) return STATUS_NOT_SAFE_SOA;
    if (!r->safe_power && !r->safe_temperature) return STATUS_NOT_SAFE_BOTH;
    if (!r->safe_power) return STATUS_NOT_SAFE_POWER;
    if (!r->safe_temperature) return STATUS_NOT_SAFE_TEMPERATURE;
    if (r->power_margin_percent < config->critical_power_margin_percent ||
        r->temperature_margin_c < config->critical_temperature_margin_c ||
        r->electrical_utilization > 0.9) return STATUS_CRITICAL;
    return STATUS_SAFE;
}

AnalysisResult analyze_operating_point(const OperatingPoint* point,
    const AppConfig* config)
{
    AnalysisResult r = {0};
    const TransistorModel* m;
    double sf;
    double peak_power = 0.0, external_rth = 0.0, thermal_rth = -1.0;
    double soa_reference_temperature;

    if (!point || !config || !point->model) {
        r.status = STATUS_INSUFFICIENT_DATA;
        return r;
    }
    m = point->model;
    sf = point->safety_factor;
    r.data_complete = sf >= 1.0 && point->vds >= 0.0 &&
        point->id >= 0.0 && point->duty_cycle > 0.0 &&
        point->duty_cycle <= 1.0 && point->reference_temperature_c >= -273.15;
    if (!r.data_complete) { r.status = STATUS_INSUFFICIENT_DATA; return r; }

    r.safe_voltage = point->vds * sf <= m->vds_max;
    r.safe_current = point->id * sf <= applicable_current_limit(point);
    r.rds_on_ohm = interpolate_rds_on(m, point->reference_temperature_c);
    r.soa_current_limit_a = interpolate_soa_current(m,
        point->pulse_duration_s, point->vds);
    r.zth_jc_k_per_w = interpolate_zth_jc(m,
        point->duty_cycle, point->pulse_duration_s);

    if (point->mode == MODE_LINEAR) {
        r.data_complete = r.soa_current_limit_a > 0.0 &&
            r.zth_jc_k_per_w > 0.0;
        peak_power = point->vds * point->id;
        r.conduction_loss_w = peak_power * point->duty_cycle;
    } else if (point->mode == MODE_SWITCHING) {
        r.data_complete = r.rds_on_ohm > 0.0 && r.zth_jc_k_per_w > 0.0 &&
            point->frequency_hz > 0.0 &&
            m->gate_charge_c > 0.0 && point->gate_drive_voltage_v > 0.0 &&
            (point->e_on_j > 0.0 || point->e_off_j > 0.0);
        r.conduction_loss_w = point->id * point->id * r.rds_on_ohm *
            point->duty_cycle;
        r.switching_loss_w = (point->e_on_j + point->e_off_j) *
            point->frequency_hz;
        r.gate_drive_loss_w = m->gate_charge_c *
            point->gate_drive_voltage_v * point->frequency_hz;
        peak_power = r.conduction_loss_w + r.switching_loss_w +
            r.gate_drive_loss_w;
    } else {
        r.data_complete = 0;
    }
    r.data_complete = r.data_complete && r.soa_current_limit_a > 0.0;
    r.p_loss = r.conduction_loss_w + r.switching_loss_w + r.gate_drive_loss_w;

    if (point->temperature_reference == TEMPERATURE_CASE) {
        thermal_rth = point->mode == MODE_LINEAR ? r.zth_jc_k_per_w : m->rth_jc;
    } else {
        external_rth = point->rth_cs + point->rth_sa;
        if (external_rth <= 0.0 && m->rth_ja > 0.0) {
            thermal_rth = m->rth_ja;
            external_rth = fmax(m->rth_ja - m->rth_jc, 0.0);
        } else
            thermal_rth = (point->mode == MODE_LINEAR ?
                r.zth_jc_k_per_w : m->rth_jc) + external_rth;
    }
    if (thermal_rth <= 0.0) r.data_complete = 0;
    if (point->mode == MODE_SWITCHING && r.data_complete) {
        int iteration;
        double estimate = point->reference_temperature_c;
        for (iteration = 0; iteration < 12; ++iteration) {
            double next;
            r.rds_on_ohm = interpolate_rds_on(m, estimate);
            r.conduction_loss_w = point->id * point->id * r.rds_on_ohm *
                point->duty_cycle;
            double conduction_peak_w = point->id * point->id * r.rds_on_ohm;
            r.p_loss = r.conduction_loss_w + r.switching_loss_w +
                r.gate_drive_loss_w;
            next = point->reference_temperature_c + sf *
                (conduction_peak_w * r.zth_jc_k_per_w +
                 (r.switching_loss_w + r.gate_drive_loss_w) * m->rth_jc +
                 r.p_loss * external_rth);
            if (fabs(next - estimate) < 0.001) { estimate = next; break; }
            estimate = next;
        }
        r.t_j = estimate;
    } else {
        r.t_j = point->reference_temperature_c + sf *
            (peak_power * r.zth_jc_k_per_w + r.p_loss * external_rth);
    }
    r.temperature_margin_c = m->t_j_max - r.t_j;
    r.safe_temperature = r.t_j <= m->t_j_max;
    r.safe_power = r.safe_temperature;
    soa_reference_temperature = point->temperature_reference == TEMPERATURE_CASE ?
        point->reference_temperature_c : point->reference_temperature_c +
            sf * r.p_loss * external_rth;
    if (soa_reference_temperature > m->soa_reference_temperature_c + 1e-9)
        r.data_complete = 0;
    r.soa_current_limit_a /= sf;
    r.safe_soa = r.soa_current_limit_a > 0.0 &&
        point->id <= r.soa_current_limit_a;
    if (r.p_loss > 0.0 && r.t_j > point->reference_temperature_c) {
        double thermal_power_limit = r.p_loss *
            (m->t_j_max - point->reference_temperature_c) /
            (r.t_j - point->reference_temperature_c);
        r.power_margin_w = thermal_power_limit - r.p_loss;
    } else {
        double equivalent_rth = point->mode == MODE_LINEAR ?
            r.zth_jc_k_per_w / point->duty_cycle + external_rth : thermal_rth;
        r.power_margin_w = equivalent_rth > 0.0 ?
            (m->t_j_max - point->reference_temperature_c) /
                (sf * equivalent_rth) : -1.0;
    }
    r.power_margin_percent = r.p_loss + r.power_margin_w > 0.0 ?
        100.0 * r.power_margin_w / (r.p_loss + r.power_margin_w) : -100.0;
    r.electrical_utilization = fmax(point->vds * sf / m->vds_max,
        point->id * sf / applicable_current_limit(point));
    if (r.soa_current_limit_a > 0.0)
        r.electrical_utilization = fmax(r.electrical_utilization,
            point->id / r.soa_current_limit_a);
    r.status = classify(&r, config);
    return r;
}

OptimizationResult calculate_optimization(const OperatingPoint* point,
    const AnalysisResult* analysis)
{
    OptimizationResult o = {0};
    OperatingPoint candidate;
    double sf = point->safety_factor >= 1.0 ? point->safety_factor : 1.0;
    double low, high;
    int iteration;
    o.thermal_power_limit_w = analysis->p_loss + analysis->power_margin_w;
    o.allowed_power_w = o.thermal_power_limit_w;
    o.limiting_factor = status_reason_to_string(analysis->status);

    o.max_current_available = analysis->data_complete && point->vds > 0.0;
    low = 0.0;
    high = applicable_current_limit(point) / sf;
    candidate = *point;
    for (iteration = 0; iteration < 60 && o.max_current_available; ++iteration) {
        AnalysisResult trial;
        candidate.id = (low + high) / 2.0;
        trial = analyze_operating_point(&candidate, &(AppConfig){0.0, 0.0,
            "", "", "", "", ""});
        if (trial.data_complete && trial.safe_voltage && trial.safe_current &&
            trial.safe_soa && trial.safe_temperature) low = candidate.id;
        else high = candidate.id;
    }
    o.max_current_a = low;

    o.max_voltage_available = analysis->data_complete && point->id > 0.0;
    low = 0.0;
    high = point->model->vds_max / sf;
    candidate = *point;
    for (iteration = 0; iteration < 60 && o.max_voltage_available; ++iteration) {
        AnalysisResult trial;
        candidate.vds = (low + high) / 2.0;
        trial = analyze_operating_point(&candidate, &(AppConfig){0.0, 0.0,
            "", "", "", "", ""});
        if (trial.data_complete && trial.safe_voltage && trial.safe_current &&
            trial.safe_soa && trial.safe_temperature) low = candidate.vds;
        else high = candidate.vds;
    }
    o.max_voltage_v = low;
    if (point->id > o.max_current_a && point->id > 0.0)
        o.current_reduction_percent = 100.0 *
            (point->id - o.max_current_a) / point->id;
    if (point->vds > o.max_voltage_v && point->vds > 0.0)
        o.voltage_reduction_percent = 100.0 *
            (point->vds - o.max_voltage_v) / point->vds;
    return o;
}

const char* transistor_type_to_string(TransistorType type)
{ return type == TRANS_MOSFET ? "MOSFET" : "UNKNOWN"; }

const char* status_to_string(SafetyStatus status)
{
    switch (status) {
    case STATUS_SAFE: return "SAFE";
    case STATUS_CRITICAL: return "CRITICAL";
    case STATUS_NOT_SAFE_POWER: return "NOT_SAFE_POWER";
    case STATUS_NOT_SAFE_TEMPERATURE: return "NOT_SAFE_TEMPERATURE";
    case STATUS_NOT_SAFE_BOTH: return "NOT_SAFE_BOTH";
    case STATUS_NOT_SAFE_VOLTAGE: return "NOT_SAFE_VOLTAGE";
    case STATUS_NOT_SAFE_CURRENT: return "NOT_SAFE_CURRENT";
    case STATUS_NOT_SAFE_SOA: return "NOT_SAFE_SOA";
    case STATUS_INSUFFICIENT_DATA: return "INSUFFICIENT_DATA";
    default: return "UNKNOWN";
    }
}

const char* status_reason_to_string(SafetyStatus status)
{
    switch (status) {
    case STATUS_SAFE: return "NONE";
    case STATUS_CRITICAL: return "LOW_MARGIN";
    case STATUS_NOT_SAFE_POWER: return "POWER";
    case STATUS_NOT_SAFE_TEMPERATURE: return "TEMPERATURE";
    case STATUS_NOT_SAFE_BOTH: return "POWER_AND_TEMPERATURE";
    case STATUS_NOT_SAFE_VOLTAGE: return "VDS_LIMIT";
    case STATUS_NOT_SAFE_CURRENT: return "ID_LIMIT";
    case STATUS_NOT_SAFE_SOA: return "SOA_LIMIT";
    case STATUS_INSUFFICIENT_DATA: return "MISSING_REQUIRED_DATA";
    default: return "UNKNOWN";
    }
}
