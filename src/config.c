#include "config.h"

#include "common.h"

#include <stdio.h>
#include <string.h>

#define CONFIG_LINE_SIZE 512
#define DEFAULT_CRITICAL_POWER_MARGIN_PERCENT 10.0
#define DEFAULT_CRITICAL_TEMPERATURE_MARGIN_C 10.0
#define DEFAULT_OUTPUT_FILE_PATH "results.csv"
#define DEFAULT_SUMMARY_FILE_PATH "summary.csv"
#define DEFAULT_LOG_FILE_PATH "transisafe.log"
#define DEFAULT_TRANSISTOR_DATABASE_PATH "transistors.csv"

void set_default_config(AppConfig* config)
{
    if (config == NULL) {
        return;
    }

    config->critical_power_margin_percent =
        DEFAULT_CRITICAL_POWER_MARGIN_PERCENT;
    config->critical_temperature_margin_c =
        DEFAULT_CRITICAL_TEMPERATURE_MARGIN_C;
    copy_text(config->output_file_path, sizeof(config->output_file_path),
        DEFAULT_OUTPUT_FILE_PATH);
    copy_text(config->summary_file_path, sizeof(config->summary_file_path),
        DEFAULT_SUMMARY_FILE_PATH);
    copy_text(config->log_file_path, sizeof(config->log_file_path),
        DEFAULT_LOG_FILE_PATH);
    copy_text(config->transistor_database_path,
        sizeof(config->transistor_database_path),
        DEFAULT_TRANSISTOR_DATABASE_PATH);
}

static int apply_config_value(
    AppConfig* config,
    const char* key,
    const char* value,
    char* error_message,
    size_t error_message_size)
{
    double numeric_value;

    if (strcmp(key, "critical_power_margin_percent") == 0) {
        if (!parse_double_token(value, &numeric_value) ||
            numeric_value < 0.0 || numeric_value > 100.0) {
            snprintf(error_message, error_message_size,
                "critical_power_margin_percent muss zwischen 0 und 100 liegen.");
            return 0;
        }
        config->critical_power_margin_percent = numeric_value;
        return 1;
    }

    if (strcmp(key, "critical_temperature_margin_c") == 0) {
        if (!parse_double_token(value, &numeric_value) || numeric_value < 0.0) {
            snprintf(error_message, error_message_size,
                "critical_temperature_margin_c darf nicht negativ sein.");
            return 0;
        }
        config->critical_temperature_margin_c = numeric_value;
        return 1;
    }

    if (strcmp(key, "output_file") == 0) {
        return copy_text(config->output_file_path,
            sizeof(config->output_file_path), value);
    }
    if (strcmp(key, "summary_file") == 0) {
        return copy_text(config->summary_file_path,
            sizeof(config->summary_file_path), value);
    }
    if (strcmp(key, "log_file") == 0) {
        return copy_text(config->log_file_path,
            sizeof(config->log_file_path), value);
    }
    if (strcmp(key, "transistor_database") == 0) {
        return copy_text(config->transistor_database_path,
            sizeof(config->transistor_database_path), value);
    }

    snprintf(error_message, error_message_size,
        "Unbekannter Konfigurationsschluessel: %s", key);
    return 0;
}

ConfigLoadStatus load_config(const char* file_path, AppConfig* config)
{
    FILE* config_file;
    char line[CONFIG_LINE_SIZE];
    char error_message[ERROR_MESSAGE_SIZE];
    int line_number = 0;
    int warning_count = 0;

    set_default_config(config);
    config_file = fopen(file_path, "r");
    if (config_file == NULL) {
        printf("Hinweis: %s wurde nicht gefunden. Standardwerte werden verwendet.\n",
            file_path);
        return CONFIG_DEFAULTS_USED;
    }

    while (fgets(line, sizeof(line), config_file) != NULL) {
        char* separator;
        char* key;
        char* value;

        line_number++;
        trim_text(line);
        if (line[0] == '\0' || line[0] == '#' || line[0] == ';') {
            continue;
        }

        separator = strchr(line, '=');
        if (separator == NULL) {
            printf("Konfigurationswarnung in Zeile %d: Kein '=' gefunden.\n",
                line_number);
            warning_count++;
            continue;
        }

        *separator = '\0';
        key = line;
        value = separator + 1;
        trim_text(key);
        trim_text(value);

        if (!apply_config_value(config, key, value,
                error_message, sizeof(error_message))) {
            printf("Konfigurationswarnung in Zeile %d: %s\n",
                line_number, error_message);
            warning_count++;
        }
    }

    fclose(config_file);
    return warning_count > 0
        ? CONFIG_LOADED_WITH_WARNINGS
        : CONFIG_LOADED;
}
