# Phase A: engineering workspace foundation

## Scope

Phase A restructures the browser application around the trusted workflow:

`Component -> Operating point -> Analysis -> Limits -> Margins -> Source`

The native C11 engine remains the only source of engineering classification,
losses, temperature, utilization, SOA limits and optimization values. React
only validates browser input constraints, invokes the API and presents returned
values.

## Reused native capabilities

- real MOSFET catalog from `transistors.csv`
- synthetic `ENGINEERING_FIXTURE` excluded from product selection
- switching and linear analysis modes
- `SAFE`, `CRITICAL`, all `NOT_SAFE_*` states and `INSUFFICIENT_DATA`
- voltage, current, SOA and temperature checks
- conduction, switching and gate-drive loss results
- junction temperature and native margins
- datasheet URL, revision and retrieval date

## Deliberately not inferred

- Manufacturer and package are not fields in the current model database/API.
- An intermediate case temperature is not exposed for ambient-reference runs.
- The exact missing curve is not identified in an `INSUFFICIENT_DATA` response.
- Raw SOA curve points are not exposed through FastAPI.
- SOA percentage reserve is not returned by the native engine.

The UI explicitly marks these gaps instead of inserting placeholder values.

## Next engineering-data work

Before implementing the interactive SOA map, extend the API with a read-only
model-data endpoint that returns the stored curve points and their provenance.
Before adding nearest-safe-point guidance, expose the applicable optimization
result and limiting condition directly from the native C response. Manufacturer
and package should be added to the authoritative CSV schema and parser before
they appear in the component passport.

## Validation

- TypeScript check and React production build
- native C unit tests
- FastAPI/native-engine smoke test

CMake remains the canonical CI path. The same source set can be compiled with a
direct C11 compiler command in environments where CMake is unavailable.
