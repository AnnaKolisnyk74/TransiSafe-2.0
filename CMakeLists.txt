cmake_minimum_required(VERSION 3.20)

project(
    TransiSafe
    VERSION 2.0
    DESCRIPTION "Engineering safety analysis and decision-support tool"
    LANGUAGES C
)

set(TRANSISAFE_CORE_SOURCES
    src/analysis.c
    src/common.c
    src/config.c
    src/csv_io.c
    src/database.c
    src/logging.c
    src/statistics.c
)

add_library(transisafe_core STATIC ${TRANSISAFE_CORE_SOURCES})
target_include_directories(transisafe_core PUBLIC src)
target_compile_features(transisafe_core PUBLIC c_std_11)

add_executable(transisafe src/main.c)
target_link_libraries(transisafe PRIVATE transisafe_core)

if(MSVC)
    target_compile_definitions(transisafe_core PRIVATE _CRT_SECURE_NO_WARNINGS)
    target_compile_options(transisafe_core PRIVATE /W4)
    target_compile_options(transisafe PRIVATE /W4)
else()
    target_compile_options(transisafe_core PRIVATE -Wall -Wextra -Wpedantic)
    target_compile_options(transisafe PRIVATE -Wall -Wextra -Wpedantic)
endif()

include(CTest)
if(BUILD_TESTING)
    add_executable(transisafe_unit_tests tests/unit_tests.c)
    target_link_libraries(transisafe_unit_tests PRIVATE transisafe_core)
    target_compile_features(transisafe_unit_tests PRIVATE c_std_11)
    if(MSVC)
        target_compile_options(transisafe_unit_tests PRIVATE /W4)
    else()
        target_compile_options(transisafe_unit_tests PRIVATE -Wall -Wextra -Wpedantic)
    endif()
    add_test(NAME transisafe_unit_tests COMMAND transisafe_unit_tests)
endif()
