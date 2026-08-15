#include "analysis.h"

#include <math.h>
#include <string.h>

static double clamp(double v, double lo, double hi)
{
    return v < lo ? lo : (v > hi ? hi : v);
}

static double interpolate(const CurvePoint* points, int count, double x,
    int logarithmic)
{
    int i;
    if (!points || count <= 0 || (logarithmic && x <= 0.0)) return -1.0;
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
    return parameterized_interpolate(model->zth_curves,
        model->zth_curve_count, duty_cycle, pulse_duration_s);
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
    const TransistorModel* m = point->model;
    double sf = point->safety_factor;
    double peak_power = 0.0, external_rth = 0.0, thermal_rth;
    double temperature_derating;

    r.data_complete = m && config && sf >= 1.0 && point->vds >= 0.0 &&
        point->id >= 0.0 && point->duty_cycle > 0.0 &&
        point->duty_cycle <= 1.0 && point->reference_temperature_c >= -273.15;
    if (!r.data_complete) { r.status = STATUS_INSUFFICIENT_DATA; return r; }

    r.safe_voltage = point->vds * sf <= m->vds_max;
    r.safe_current = point->id * sf <=
        (point->pulse_duration_s <= m->id_pulse_duration_max_s ?
            m->id_pulse_max : m->id_max);
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
        r.data_complete = r.rds_on_ohm > 0.0 && point->frequency_hz > 0.0 &&
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

    temperature_derating = clamp((m->t_j_max - point->reference_temperature_c) /
        (m->t_j_max - 25.0), 0.0, 1.0);
    r.soa_current_limit_a *= temperature_derating / sf;
    r.safe_soa = r.soa_current_limit_a > 0.0 &&
        point->id <= r.soa_current_limit_a;

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
            r.p_loss = r.conduction_loss_w + r.switching_loss_w +
                r.gate_drive_loss_w;
            next = point->reference_temperature_c + sf * r.p_loss * thermal_rth;
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
    r.power_margin_w = thermal_rth > 0.0 ?
        (m->t_j_max - point->reference_temperature_c) / (sf * thermal_rth) -
        r.p_loss : -1.0;
    r.power_margin_percent = r.p_loss + r.power_margin_w > 0.0 ?
        100.0 * r.power_margin_w / (r.p_loss + r.power_margin_w) : -100.0;
    r.electrical_utilization = fmax(point->vds * sf / m->vds_max,
        point->id * sf /
            (point->pulse_duration_s <= m->id_pulse_duration_max_s ?
                m->id_pulse_max : m->id_max));
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
    double sf = point->safety_factor >= 1.0 ? point->safety_factor : 1.0;
    o.thermal_power_limit_w = analysis->p_loss + analysis->power_margin_w;
    o.allowed_power_w = o.thermal_power_limit_w;
    o.limiting_factor = status_reason_to_string(analysis->status);
    o.max_current_available = point->vds > 0.0;
    o.max_current_a = analysis->soa_current_limit_a;
    {
        double absolute_limit = point->pulse_duration_s <=
            point->model->id_pulse_duration_max_s ?
            point->model->id_pulse_max / sf : point->model->id_max / sf;
        if (o.max_current_a <= 0.0 || absolute_limit < o.max_current_a)
            o.max_current_a = absolute_limit;
    }
    if (o.max_current_a <= 0.0) o.max_current_a = point->model->id_max / sf;
    o.max_voltage_available = point->id > 0.0;
    o.max_voltage_v = point->model->vds_max / sf;
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
