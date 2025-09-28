# Nutri Scan

A Vite + React application that analyzes meal photos using OpenAI GPT-4o and keeps a nutrition history in a browser-backed JSON store.

## Prerequisites

- Node.js 18+
- An OpenAI API key with access to the GPT-4o model (optional for mock responses)
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
   # Optional fallback for running `npm run dev` without Netlify
   VITE_OPENAI_API_KEY=sk-your-key
   # Optional: enables authenticated requests for workout plans and anatomy assets
   VITE_WGER_API_KEY=your-wger-token
   ```
   If the keys are not provided the app falls back to a mock nutritional analysis for testing purposes.
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

- **Image analysis**: The upload flow converts photos to base64 data URLs and proxies them through a Netlify function that invokes OpenAI GPT-4o (vision + text) for calorie and macronutrient estimates.
- **Storage**: Meals are stored in `src/data/meals.json` and synchronized to `localStorage` so the app behaves like an offline JSON database in the browser.
- **Mock mode**: When no API key is configured, a realistic mock response is returned so the experience can be demonstrated without external calls.
