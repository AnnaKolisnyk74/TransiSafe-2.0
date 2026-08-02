#include "logging.h"

#include "common.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

static char g_log_file_path[PATH_SIZE] = "transisafe.log";

void logging_set_path(const char* file_path)
{
    if (file_path != NULL) {
        copy_text(g_log_file_path, sizeof(g_log_file_path), file_path);
    }
}

static const char* log_level_to_string(LogLevel level)
{
    switch (level) {
    case LOG_INFO: return "INFO";
    case LOG_WARNING: return "WARNING";
    case LOG_ERROR: return "ERROR";
    default: return "UNKNOWN";
    }
}

void write_log(LogLevel level, const char* format, ...)
{
    FILE* log_file;
    time_t current_time;
    struct tm local_time;
    char timestamp[32];
    va_list arguments;
    int time_available = 0;

    log_file = fopen(g_log_file_path, "a");
    if (log_file == NULL) {
        fprintf(stderr, "Warnung: Logdatei konnte nicht geoeffnet werden: %s\n",
            g_log_file_path);
        return;
    }

    current_time = time(NULL);
#ifdef _WIN32
    time_available = localtime_s(&local_time, &current_time) == 0;
#else
    {
        struct tm* local_time_pointer = localtime(&current_time);
        if (local_time_pointer != NULL) {
            local_time = *local_time_pointer;
            time_available = 1;
        }
    }
#endif
    if (time_available) {
        strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", &local_time);
    }
    else {
        copy_text(timestamp, sizeof(timestamp), "UNKNOWN_TIME");
    }

    fprintf(log_file, "%s | %-7s | ", timestamp, log_level_to_string(level));
    va_start(arguments, format);
    vfprintf(log_file, format, arguments);
    va_end(arguments);
    fputc('\n', log_file);
    fclose(log_file);
}
