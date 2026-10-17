# V31 Live Integration

V31 keeps the V30 Mission Command Center UI but adds a real API connection path.

## Live login

On the login screen, enter the deployed API base URL, username, and password. The frontend then authenticates against `/api/auth/login` and uses the returned bearer token for records, audit and backup requests.

If the API URL is left blank, the application falls back to the local demo workspace.

## GitHub Pages

GitHub Pages hosts the frontend. The V31 backend must be deployed separately. Set the API URL to the deployed HTTPS API origin.

For a project site, keep internal frontend assets relative (`./assets/...`) so the site works under `https://OWNER.github.io/REPOSITORY/`.
