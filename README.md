# Nutri Scan

A Vite + React application that analyzes meal photos using OpenAI GPT-4o and keeps a nutrition history in a browser-backed JSON store.

## Prerequisites

- Node.js 18+
- An OpenAI API key with access to the GPT-4o model (optional for mock responses)
- (Optional) A [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) API key for faster ingredient lookups
- (Optional) A [wger](https://wger.de/en/software/api) API token for richer workout visuals and authenticated exercise lookups
- (Optional) [Netlify CLI](https://docs.netlify.com/cli/get-started/) for local function development

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file in the project root with your API keys. The Netlify function reads `OPENAI_API_KEY`; providing
   `VITE_OPENAI_API_KEY` enables the in-browser fallback without running Netlify locally.
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

## How It Works

- **Image analysis**: The upload flow converts photos to base64 data URLs and proxies them through a Netlify function that invokes OpenAI GPT-4o (vision + text) for calorie and macronutrient estimates with aggressive caching and configurable timeouts to reduce first-call stalls.
- **Storage**: Meals are stored in `src/data/meals.json` and synchronized to `localStorage` so the app behaves like an offline JSON database in the browser.
- **Ingredient suggestions**: Ingredient lookups and per-ingredient calorie estimates are proxied through the Netlify function to the OpenAI API for contextual results. When the key is missing or OpenAI cannot be reached, the UI falls back to a curated set of common foods with per-gram nutrition data.
- **Mock mode**: When no API keys are configured, realistic mock responses are returned so the experience can be demonstrated without external calls.
