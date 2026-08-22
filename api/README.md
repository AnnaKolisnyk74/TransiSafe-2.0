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

## LinkedIn sign-in (optional)

The login panel is ready for LinkedIn OpenID Connect. Configure a LinkedIn
developer application and set these environment variables before starting the
API:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI` (defaults to `http://127.0.0.1:8000/api/auth/linkedin/callback`)
- `TRANSISAFE_WEB_URL` (defaults to `http://127.0.0.1:5174/`)

Register the exact redirect URI in the LinkedIn developer portal and enable
the **Sign in with LinkedIn using OpenID Connect** product. Standard OIDC
provides name, email (optional) and profile picture. Employer/company data is
only displayed when a separately approved LinkedIn organization integration
provides it; TransiSafe does not infer it.
Set `TRANSISAFE_ENGINE` when the executable is outside the normal CMake build
directories.
