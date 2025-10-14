# Nutri Scan

A Vite + React application that analyzes meal photos using OpenAI GPT-4o and now persists nutrition, workout, and measurement data in PostgreSQL via Netlify serverless functions with secure user authentication.

## Prerequisites

- Node.js 18+
- An OpenAI API key with access to the GPT-4o model (optional for mock responses)
- A PostgreSQL database (the project is configured for Neon) with credentials exposed to Netlify via environment variables
- (Optional) A [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) API key for faster ingredient lookups
- (Optional) A [wger](https://wger.de/en/software/api) API token for richer workout visuals and authenticated exercise lookups
- (Optional) [Netlify CLI](https://docs.netlify.com/cli/get-started/) for local function development

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file in the project root with your API keys and database connection strings. The Netlify function reads
   `OPENAI_API_KEY`; providing `VITE_OPENAI_API_KEY` enables the in-browser fallback without running Netlify locally. Set the
   Postgres connection string (e.g., from Neon) so the serverless function can create tables and persist data.
   ```env
   OPENAI_API_KEY=sk-your-key
   # Optional: override request timeouts (ms) for OpenAI calls
   # OPENAI_REQUEST_TIMEOUT_MS=15000
   # OPENAI_ANALYSIS_TIMEOUT_MS=30000
   # Optionally override the smaller models used for typeahead + nutrition fills
   # OPENAI_SUGGESTION_MODEL=gpt-4o-mini
   # OPENAI_NUTRITION_MODEL=gpt-4o-mini
   # Optional: enables USDA-backed ingredient typeahead with caching
   USDA_API_KEY=your-fooddata-central-key
   # Optional fallback for running `npm run dev` without Netlify
   VITE_OPENAI_API_KEY=sk-your-key
   # Optional: enables authenticated requests for workout plans and anatomy assets
   VITE_WGER_API_KEY=your-wger-token
   # PostgreSQL connection strings (pooled + direct) used by Netlify functions
   NETLIFY_DATABASE_URL=postgresql://user:password@host/db?sslmode=require
   NETLIFY_DATABASE_URL_UNPOOLED=postgresql://user:password@host/db?sslmode=require
   ```
   If the keys are not provided the app falls back to a mock nutritional analysis and a small built-in ingredient library for testing purposes.
3. Start the development server:
   - For full-stack testing with serverless functions:
     ```bash
     npx netlify dev
     ```
   - For client-only development with optional direct OpenAI requests:
     ```bash
     npm run dev
     ```

## Building for Production

```bash
npm run build
```

The Netlify bundle is configured to ship the `pg` driver alongside the function code. Ensure dependencies are installed before
deploying so the PostgreSQL client remains available at runtime. The deployment also packages transitive utilities such as
`postgres-interval` and `xtend` so all of the driver's parsing helpers resolve correctly in production.

## How It Works

- **Image analysis**: The upload flow converts photos to base64 data URLs and proxies them through a Netlify function that invokes OpenAI GPT-4o (vision + text) for calorie and macronutrient estimates with aggressive caching and configurable timeouts to reduce first-call stalls.
- **Storage**: Meals, diet plans, and measurement data are stored in PostgreSQL. The Netlify function lazily creates the schema, seeds default content, and persists per-user records using secure sessions.
- **Authentication**: Users register and authenticate through the Netlify API, which hashes passwords with PBKDF2 (using the Node.js crypto library), stores session tokens securely, and gates routes/menus by role. A `sample_user` (`sampleUser234!@`) and `admin` (`sampleAdmin234!@`) account are created automatically for demos.
- **Ingredient suggestions**: Ingredient lookups and per-ingredient calorie estimates are proxied through the Netlify function to the OpenAI API for contextual results. When the key is missing or OpenAI cannot be reached, the UI falls back to a curated set of common foods with per-gram nutrition data.
- **Mock mode**: When no API keys are configured, realistic mock responses are returned so the experience can be demonstrated without external calls.
