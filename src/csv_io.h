#ifndef TRANSISAFE_CSV_IO_H
#define TRANSISAFE_CSV_IO_H

#include "transisafe_types.h"

#include <stddef.h>

int parse_operating_point_line(
    char* line,
    const TransistorDatabase* database,
    OperatingPoint* point,
    char* error_message,
    size_t error_message_size);

int run_csv_mode(
    const AppConfig* config,
    const TransistorDatabase* database);

#endif
