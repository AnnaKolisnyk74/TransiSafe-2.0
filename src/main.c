#include "analysis.h"
#include "config.h"
#include "csv_io.h"
#include "database.h"
#include "logging.h"

#include <stdio.h>
#include <string.h>

static int read_value(const char* prompt, double* value)
{
    printf("%s", prompt);
    return scanf("%lf", value) == 1;
}

static int run_interactive(const AppConfig* config,
    const TransistorDatabase* database)
{
    char id[ID_SIZE], mode[16], temp_ref[16];
    OperatingPoint p = {0};
    AnalysisResult r;
    printf("MOSFET-ID: ");
    if (scanf("%63s", id) != 1 ||
        !find_transistor_by_id(database, id, &p.model)) return 1;
    printf("Modus [LINEAR/SWITCHING]: ");
    if (scanf("%15s", mode) != 1) return 1;
    p.mode = strcmp(mode, "SWITCHING") == 0 ? MODE_SWITCHING : MODE_LINEAR;
    if (!read_value("VDS [V]: ", &p.vds) ||
        !read_value("ID [A]: ", &p.id) ||
        !read_value("Pulsdauer [s]: ", &p.pulse_duration_s) ||
        !read_value("Frequenz [Hz; 0 bei linear]: ", &p.frequency_hz) ||
        !read_value("Tastverhaeltnis [0..1]: ", &p.duty_cycle)) return 1;
    printf("Temperaturbezug [AMBIENT/CASE]: ");
    if (scanf("%15s", temp_ref) != 1) return 1;
    p.temperature_reference = strcmp(temp_ref, "CASE") == 0 ?
        TEMPERATURE_CASE : TEMPERATURE_AMBIENT;
    if (!read_value("Referenztemperatur [C]: ", &p.reference_temperature_c) ||
        !read_value("RthCS [K/W]: ", &p.rth_cs) ||
        !read_value("RthSA [K/W]: ", &p.rth_sa) ||
        !read_value("Sicherheitsfaktor [>=1]: ", &p.safety_factor) ||
        !read_value("Eon [J; 0 bei linear]: ", &p.e_on_j) ||
        !read_value("Eoff [J; 0 bei linear]: ", &p.e_off_j) ||
        !read_value("Gate-Spannung [V; 0 bei linear]: ", &p.gate_drive_voltage_v)) return 1;
    r = analyze_operating_point(&p, config);
    printf("\nStatus: %s (%s)\n", status_to_string(r.status),
        status_reason_to_string(r.status));
    printf("Pcond=%.6g W, Psw=%.6g W, Pgate=%.6g W, Ptotal=%.6g W\n",
        r.conduction_loss_w, r.switching_loss_w, r.gate_drive_loss_w, r.p_loss);
    printf("Tj=%.3f C, SOA-Grenze=%.6g A, ZthJC=%.6g K/W\n",
        r.t_j, r.soa_current_limit_a, r.zth_jc_k_per_w);
    return 0;
}

int main(void)
{
    AppConfig config;
    TransistorDatabase database;
    int mode;
    load_config(CONFIG_FILE_PATH, &config);
    logging_set_path(config.log_file_path);
    if (!load_transistor_database(config.transistor_database_path, &database) ||
        !load_mosfet_curves(config.curve_database_path, &database)) {
        printf("MOSFET-Stamm- oder Kurvendaten konnten nicht geladen werden.\n");
        return 1;
    }
    printf("TransiSafe MOSFET Analysis Core\n");
    print_transistor_database(&database);
    printf("1) Einzelanalyse\n2) CSV-Analyse\nModus: ");
    if (scanf("%d", &mode) != 1) return 1;
    return mode == 1 ? run_interactive(&config, &database) :
        (mode == 2 ? run_csv_mode(&config, &database) : 1);
}
