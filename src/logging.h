#ifndef TRANSISAFE_LOGGING_H
#define TRANSISAFE_LOGGING_H

#include "transisafe_types.h"

void logging_set_path(const char* file_path);
void write_log(LogLevel level, const char* format, ...);

#endif
