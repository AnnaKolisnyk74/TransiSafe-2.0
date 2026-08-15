# TransiSafe API

The API is a thin HTTP adapter. All engineering decisions remain in the native
`transisafe_json` C executable; Python only validates requests, invokes the
engine and returns its JSON response.

## Start locally

Build the C project first, then create a Python virtual environment and run:

```sh
pip install -r api/requirements.txt
uvicorn api.main:app --reload --port 8000
```

Interactive API documentation is available at `http://localhost:8000/docs`.
Set `TRANSISAFE_ENGINE` when the executable is outside the normal CMake build
directories.
