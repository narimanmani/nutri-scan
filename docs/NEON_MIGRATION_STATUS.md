# Neon Database Migration Status

## Summary

The requested migration from Netlify Blobs/local storage to Neon Postgres could not be completed in this environment. The project requires the `@neondatabase/serverless`, `bcryptjs`, `jsonwebtoken`, and `cookie` packages (or similar Postgres and session tooling) to connect to Neon, create the required tables, and implement secure session handling. Installing these packages fails consistently with a `403 Forbidden` response from the npm registry.

## Environment constraints encountered

```text
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/@neondatabase%2fserverless
```

Without the ability to install the Neon client and cryptographic helpers, the application cannot:

1. Check for and create the required Neon tables for meals, diet plans, body measurements, and users.
2. Seed Neon with the existing JSON-based data or create the required default accounts (`sample_user`, `admin`).
3. Replace the current local storage utilities with database-backed CRUD logic.
4. Implement secure, cookie-based user authentication/authorization tied to Neon.

## Next steps when registry access is restored

1. Install the required dependencies:
   ```bash
   npm install @neondatabase/serverless bcryptjs jsonwebtoken cookie
   ```
2. Add a Netlify serverless utility (e.g., `netlify/lib/database.js`) that:
   - Connects to `NETLIFY_DATABASE_URL(_UNPOOLED)`.
   - Ensures required tables/columns exist.
   - Seeds the database with existing JSON data for `sample_user` and creates the default admin account.
3. Update `netlify/functions/api.js` (or add a new function) to expose CRUD endpoints backed by Neon for meals, diet plans, measurement history, and measurement layouts.
4. Replace the local storage helpers in `src/api/storage.js`, `src/utils/measurementHistory.js`, and `src/utils/bodyMeasurementLayout.js` with fetches to the new Netlify endpoints.
5. Introduce an authentication context/UI so users can log in (regular vs admin), and update the menu routes to respect roles (e.g., restrict Body Measurements Admin to admin users).
6. Remove references to local JSON persistence once Neon integration is fully working.

Until the dependency installation issue is resolved, the project must continue using the current local storage implementation.
