#ifndef TRANSISAFE_CONFIG_H
#define TRANSISAFE_CONFIG_H

#include "transisafe_types.h"

#define CONFIG_FILE_PATH "transisafe.ini"

void set_default_config(AppConfig* config);
ConfigLoadStatus load_config(const char* file_path, AppConfig* config);

#endif
