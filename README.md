# Care.fi Patient Locker

A private workspace for patient documents, insurer query analysis, and patient follow-up through email and WhatsApp.

## Features

- Patient profiles, claim-scoped documents, private downloads, and archiving.
- PDF/image extraction and evidence-based query matching with Gemini.
- Clear available, missing, and review-required results for each insurer request.
- Configurable messages, consent checks, independent email/WhatsApp jobs, and bounded retries.
- Duplicate detection, query history, delivery status, and activity logs.
- Optional fictional workspace: 10 patients, 35 documents, and four labeled sample analyses.

## Stack

| Layer              | Technology                                     |
| ------------------ | ---------------------------------------------- |
| Application        | Next.js 16 App Router, React 19, TypeScript    |
| Interface          | Tailwind CSS 4, Lucide, reusable UI components |
| Database           | Turso/libSQL, Drizzle migrations               |
| Identity and files | Supabase Auth, private Supabase Storage        |
| Hosting            | Vercel Node.js Functions and Cron              |
| Providers          | Gemini, Resend, Twilio WhatsApp                |

## Quick start

Requires **Node.js 24**, a Turso database, and a Supabase project.

1. Install dependencies: `npm ci`.
2. Copy `.env.example` to `.env.local` and configure the database and Supabase variables below.
3. Run `npm run db:migrate` and `npm run storage:setup`.
4. In Supabase Authentication, disable public sign-ups and create a confirmed email/password user for the evaluator. Set the project's Site URL to your app URL.
5. Run `npm run dev`, open `http://localhost:3000`, and sign in.
6. Choose **Load sample workspace** from the empty dashboard, or add a patient.

There is no default password or authentication bypass. Each Supabase user gets an isolated workspace. For local database development, `TURSO_DATABASE_URL=file:local.db` also works; Vercel requires a remote database.

## Configuration

| Variable                                                          | Purpose                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `TURSO_DATABASE_URL`                                              | Remote libSQL database URL                                        |
| `TURSO_AUTH_TOKEN`                                                | Server-side database token                                        |
| `NEXT_PUBLIC_SUPABASE_URL`                                        | Supabase project URL                                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                   | Public Supabase anon key for authentication and signed uploads    |
| `SUPABASE_SERVICE_ROLE_KEY`                                       | Server-only storage access; never expose in client variables      |
| `SUPABASE_STORAGE_BUCKET`                                         | Private bucket name; defaults to `patient-documents`              |
| `CRON_SECRET`                                                     | Random server-only scheduler secret; use at least 32 random bytes |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                  | Document extraction and semantic analysis                         |
| `RESEND_API_KEY`, `EMAIL_FROM`                                    | Email delivery from a verified sender                             |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | WhatsApp delivery                                                 |
| `TWILIO_CONTENT_SID`                                              | Optional approved WhatsApp template                               |
| `TEST_EMAIL`, `TEST_WHATSAPP`                                     | Evaluation recipients; required for fictional profiles            |

Provider credentials are optional for browsing. Without Gemini, analysis is marked as requiring setup; missing delivery credentials block jobs rather than simulating success. TXT extraction works without Gemini.

## Deploy on Vercel

1. Import [yash022/care.fi](https://github.com/yash022/care.fi). Select the repository root and Node.js 24. `vercel.json` supplies the Next.js build configuration.
2. Add the environment variables to the intended deployment environment. Use separate database/storage projects for isolated previews.
3. Run database migrations and storage setup from a trusted local terminal with that environment's credentials. They are intentionally not part of every preview build.
4. Deploy, set the Supabase Site URL to the deployed URL, and sign in with the provisioned account.
5. Verify document upload/download, query processing, and delivery with your evaluation destinations.

The configured daily cron is compatible with Hobby scheduling. For timely unattended retries, use a plan that supports more frequent cron runs and change the schedule, or configure a trusted external scheduler for `/api/cron` with `Authorization: Bearer <CRON_SECRET>`. The portal also exposes **Refresh delivery**.

Files up to 10 MB upload directly to private storage using server-authorized signed URLs, avoiding Vercel's request-body limit. Downloads authorize account ownership before issuing a 60-second signed link. Keep the bucket private and do not add public storage policies.

## Commands

| Command                       | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                 | Start Next.js development                                        |
| `npm run build` / `npm start` | Build / run the production application                           |
| `npm run db:migrate`          | Apply pending database migrations                                |
| `npm run storage:setup`       | Create/update the private bucket with a 10 MB limit              |
| `npm test`                    | Run domain, provider, database, and API regression tests         |
| `npm run check`               | TypeScript, tests, and formatting checks                         |
| `npm run test:smoke`          | Test a running local app using a dedicated Supabase test account |
| `npm run format`              | Format authored source and documentation                         |
| `npm run lint`                | ESLint; pre-existing loose-type errors remain                    |

GitHub Actions runs `check` and the native Next.js build. Automated provider tests mock external delivery. The authenticated smoke test requires `SMOKE_EMAIL` and `SMOKE_PASSWORD`, a dedicated sample workspace, and unconfigured delivery/analysis providers.

## Structure

```text
app/                 Login, portal UI, API handlers, cron endpoint
components/ui/       Reusable UI components
lib/auth.ts          Server-verified Supabase identity
lib/database.ts      Prepared-query adapter for libSQL
lib/storage.ts       Private storage and signed URLs
lib/domain.ts        Classification, evidence validation, message rendering
lib/server.ts        Analysis, records, and delivery orchestration
db/ + drizzle/       Schema and versioned migrations
scripts/             Database and storage setup
tests/               Domain, provider, API, and database checks
```

See [PRODUCT.md](PRODUCT.md) for evaluation, runtime behavior, and existing-data migration notes.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side), [Turso TypeScript SDK](https://docs.turso.tech/sdk/ts/reference), [Vercel limits](https://vercel.com/docs/functions/limitations), [Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
