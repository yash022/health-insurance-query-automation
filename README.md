# Care.fi Patient Locker

A patient document workspace for reviewing insurer queries, finding supporting evidence, and requesting missing documents through email and WhatsApp.

## Features

- Account-scoped patient profiles, claim details, document uploads, downloads, and archiving.
- Gemini-powered extraction and query matching with document evidence.
- Separate results for available, missing, and uncertain information.
- Configurable messages, consent checks, independent delivery jobs, and bounded retries.
- Query history, delivery status, duplicate detection, and activity logs.
- Evaluation workspace with 10 fictional patients, 35 text documents, and four labeled sample analyses.

## Stack

| Layer          | Technology                                            |
| -------------- | ----------------------------------------------------- |
| Interface      | React 19, TypeScript, Tailwind CSS 4, Lucide          |
| Application    | Next.js App Router conventions, Vinext, Vite          |
| Runtime        | Cloudflare Workers / Sites                            |
| Storage        | Cloudflare D1, Drizzle migrations, private R2 objects |
| Authentication | Sites-managed ChatGPT sign-in                         |
| Integrations   | Gemini, Resend, Twilio WhatsApp                       |

## Run locally

Use **Node.js 24** and npm. Run commands from this directory.

```sh
npm ci
npm run build
```

Apply each migration once to the local database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_white_doctor_doom.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_amusing_spacker_dave.sql
npm run dev
```

Open the printed URL (normally `http://localhost:5173`), then visit `/signin-with-chatgpt?return_to=/`. Portable development provides a loopback-only test identity. The first authenticated visit loads fictional sample records.

## Environment

Copy `.dev.vars.example` to `.dev.vars`, configure the services you want to evaluate, and restart the server. Never commit credentials.

| Variables                                                         | Purpose                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                  | Extraction and semantic query analysis                            |
| `RESEND_API_KEY`, `EMAIL_FROM`                                    | Email from a verified sender                                      |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | WhatsApp delivery                                                 |
| `TWILIO_CONTENT_SID`                                              | Optional approved WhatsApp template                               |
| `TEST_EMAIL`, `TEST_WHATSAPP`                                     | Evaluation recipients; required for fictional profiles            |
| `CRON_SECRET`                                                     | Authentication for an externally configured maintenance scheduler |

Without credentials, the workspace reports setup requirements instead of simulating successful analysis or delivery. TXT extraction works without Gemini; PDF/image extraction requires it.

## Evaluation

1. Inspect a sample patient and the existing documents.
2. Configure providers and your test destinations.
3. Upload an insurer query or paste its text.
4. Review every request and its evidence in Query history.
5. Inspect both jobs in Messages; provider acceptance and confirmed delivery are separate states.
6. Upload the same query again to verify duplicate detection.

See [PRODUCT.md](PRODUCT.md) for provider setup, retries, access boundaries, and the detailed walkthrough.

## Commands

| Command               | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `npm run dev`         | Start development with local Cloudflare bindings   |
| `npm run build`       | Build the Worker application                       |
| `npm start`           | Preview the built Worker locally                   |
| `npm test`            | Run domain and mocked-provider tests               |
| `npm run typecheck`   | Check TypeScript                                   |
| `npm run format`      | Format application code and documentation          |
| `npm run check`       | TypeScript, tests, and formatting                  |
| `npm run lint`        | ESLint; existing loose types still produce errors  |
| `npm run test:smoke`  | Exercise the running local API with synthetic data |
| `npm run db:generate` | Generate migrations                                |

GitHub Actions runs checks and the Worker build on pushes and pull requests. Provider tests use in-memory SQLite and mocked requests; they do not send messages. The API smoke test requires a freshly initialized sample workspace without provider credentials.

## Deployment

### Cloudflare / Sites

The complete application currently targets Cloudflare Workers. `.openai/hosting.json` declares `DB` and `BUCKET`. Use the existing Sites workflow, apply migrations, configure server-side secrets, and retain private access. Local data is not deployed.

### Vercel configuration: migration pending

`vercel.json` supplies the Next.js preset, direct `next build`, and locked npm installation. This prepares configuration for a native migration; **the current Cloudflare application cannot deploy directly to Vercel**.

Before deploying, replace the `cloudflare:workers` database/storage bindings with Vercel-compatible access, replace Sites-injected identity with verified sessions, and port scheduled maintenance. Client-supplied identity headers must not be trusted on a standalone deployment. Use the repository root as the Vercel Root Directory.

Reference: [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Structure

```text
app/                  Pages, portal UI, API handlers
components/ui/        Reusable UI components
lib/domain.ts         Classification, evidence validation, message rendering
lib/server.ts         Persistence, analysis, delivery orchestration
db/                   Database schema and Drizzle adapter
drizzle/              SQL migrations
worker/               Worker entry point and maintenance
scripts/              Runtime and build tooling
tests/                Domain, provider, and API checks
public/               Static assets
```

Original files are private, access is account-scoped, and real patient messages require consent. Sample analyses are curated examples. Real provider delivery requires verification with configured credentials; this project does not claim production certification.
