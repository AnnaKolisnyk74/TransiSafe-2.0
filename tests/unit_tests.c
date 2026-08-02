#include "analysis.h"
#include "common.h"
#include "statistics.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>

static int g_failures = 0;

static void expect_true(int condition, const char* name)
{
    if (!condition) {
        fprintf(stderr, "FAILED: %s\n", name);
        g_failures++;
    }
}

static void expect_close(double actual, double expected, const char* name)
{
    if (fabs(actual - expected) > 1e-9) {
        fprintf(stderr, "FAILED: %s (expected %.9f, got %.9f)\n",
            name, expected, actual);
        g_failures++;
    }
}

static AppConfig test_config(void)
{
    AppConfig config = {0};
    config.critical_power_margin_percent = 10.0;
    config.critical_temperature_margin_c = 10.0;
    return config;
}

static void test_power_and_temperature_calculation(void)
{
    AppConfig config = test_config();
    TransistorModel model = {"TEST_MODEL", TRANS_MOSFET, 20.0, 5.0, 200.0};
    OperatingPoint point = {&model, 4.0, 2.0, 25.0};
    AnalysisResult result = analyze_operating_point(&point, &config);

    expect_close(result.p_loss, 8.0, "P_loss = voltage * current");
    expect_close(result.t_j, 65.0, "T_j = T_amb + P_loss * RthJA");
}

static void test_boundary_classification(void)
{
    AppConfig config = test_config();
    TransistorModel model = {"BOUNDARY", TRANS_BJT, 10.0, 10.0, 125.0};
    OperatingPoint point = {&model, 10.0, 1.0, 25.0};
    AnalysisResult result = analyze_operating_point(&point, &config);

    expect_true(result.safe_power, "power limit is inclusive");
    expect_true(result.safe_temperature, "temperature limit is inclusive");
    expect_true(result.status == STATUS_CRITICAL,
        "zero safety margin is classified as CRITICAL");
}

static void test_maximum_allowed_current(void)
{
    AppConfig config = test_config();
    TransistorModel model = {"THERMAL_LIMIT", TRANS_MOSFET, 10.0, 50.0, 150.0};
    OperatingPoint point = {&model, 5.0, 1.0, 25.0};
    AnalysisResult result = analyze_operating_point(&point, &config);
    OptimizationResult optimization = calculate_optimization(&point, &result);

    expect_close(optimization.thermal_power_limit_w, 2.5,
        "thermal power limit");
    expect_close(optimization.max_current_a, 0.5,
        "maximum allowed current");
    expect_true(optimization.max_current_available,
        "maximum current is available for nonzero voltage");
}

static void test_invalid_numbers(void)
{
    double value = 0.0;

    expect_true(!parse_double_token("abc", &value), "reject alphabetic input");
    expect_true(!parse_double_token("12x", &value), "reject trailing characters");
    expect_true(!parse_double_token("nan", &value), "reject NaN");
    expect_true(!parse_double_token("inf", &value), "reject infinity");
    expect_true(parse_double_token(" 12.5 ", &value), "accept valid number");
    expect_close(value, 12.5, "parse valid number exactly");
}

static void test_most_critical_operating_point(void)
{
    AppConfig config = test_config();
    TransistorModel model = {"CRITICALITY", TRANS_MOSFET, 10.0, 5.0, 150.0};
    OperatingPoint first = {&model, 5.0, 1.0, 25.0};
    OperatingPoint second = {&model, 6.0, 2.0, 25.0};
    AnalysisResult first_result = analyze_operating_point(&first, &config);
    AnalysisResult second_result = analyze_operating_point(&second, &config);
    StatisticsResult statistics;

    initialize_statistics(&statistics);
    update_statistics(&statistics, 1, &first, &first_result);
    update_statistics(&statistics, 2, &second, &second_result);

    expect_true(statistics.most_critical_index == 2,
        "select highest-utilization operating point");
    expect_true(statistics.most_critical_status == STATUS_NOT_SAFE_POWER,
        "preserve status of most critical point");
}

int main(void)
{
    test_power_and_temperature_calculation();
    test_boundary_classification();
    test_maximum_allowed_current();
    test_invalid_numbers();
    test_most_critical_operating_point();

    if (g_failures != 0) {
        fprintf(stderr, "%d unit test assertion(s) failed.\n", g_failures);
        return EXIT_FAILURE;
    }

    printf("All TransiSafe unit tests passed.\n");
    return EXIT_SUCCESS;
}
