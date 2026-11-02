# Care.fi Patient Locker

An account-private patient document portal with persistent Cloudflare D1 records, R2 originals, query extraction and evidence-based matching, configurable patient messages, and independent WhatsApp/email delivery jobs.

## Start locally

Requires Node 24 (tests use built-in TypeScript stripping and SQLite) and npm.

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_white_doctor_doom.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_amusing_spacker_dave.sql
npm run dev
```

Apply each local migration once. Open the printed URL and sign in using `/signin-with-chatgpt?return_to=/`. The starter provides a loopback-only mock identity in development. Hosted sign-in is handled by Sites; never expose the development server to the internet. Local and hosted records are separate.

The first visit creates 10 clearly fictional profiles, 35 text documents and four curated sample analyses. The sample analyses are labeled and never claim to be live AI results. Actual uploads always run the processing pipeline. Sample records cannot send to their example addresses; TEST_EMAIL/TEST_WHATSAPP overrides are required.

## Enable real processing

Copy `.dev.vars.example` to `.dev.vars` for local development. For hosting, set the same keys as server-side Site environment variables. Secrets are never exposed by `/api/state` or stored in browser storage. Restart local development after changing environment variables.

| Service             | Required configuration                                      | Behavior                                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini              | GEMINI_API_KEY; optional GEMINI_MODEL                       | Transcribes PDFs/images, decomposes all requests, and compares actual document text. TXT uploads are extracted without an external provider.                                                                                  |
| Resend              | RESEND_API_KEY, EMAIL_FROM                                  | Sends plain-text email; sender must be verified by the provider. Uses a stable per-job idempotency key.                                                                                                                       |
| Twilio              | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM | Sends WhatsApp messages through the Messages API. Sandbox recipients must first join your sandbox.                                                                                                                            |
| WhatsApp template   | TWILIO_CONTENT_SID                                          | Optional approved template with variable `1` containing the rendered message. Configure an approved template for business-initiated messages outside the customer-service window; WhatsApp/provider restrictions still apply. |
| Evaluation contacts | TEST_EMAIL, TEST_WHATSAPP                                   | Override destinations with your actual test inbox and joined/approved WhatsApp number. Phone numbers must be E.164, e.g. +919876543210.                                                                                       |
| Scheduler           | CRON_SECRET                                                 | Authenticates the maintenance endpoint described below.                                                                                                                                                                       |

Without Gemini, the app shows conservative candidate matching and `Analysis setup needed`; it does not send guessed requests. Without delivery credentials, jobs remain blocked with the specific reason. These are setup states, not simulated success.

Record patient communication consent in the profile before sending from real patient records. The configured test destinations are used only when their environment variables are present. Existing job recipients are snapshotted; use the explicit retry action after changing a contact or test override.

### Unattended retries and recovery

The initial upload request processes analysis and both delivery channels automatically; no send button is required. Jobs and query state persist before provider calls. Retryable rejections receive exponential backoff and stop after five attempts. Accepted messages are not resent. A network timeout on WhatsApp is marked uncertain because Twilio may have accepted it; verify the provider console instead of blindly retrying.

For retries while no one has the portal open, configure a trusted scheduler to POST to `/internal/tick` once per minute with `Authorization: Bearer <CRON_SECRET>`. Private Sites also require their platform service-access header (`OAI-Sites-Authorization`) at the dispatch boundary. Never expose either credential in browser code or a public URL. The Worker additionally exports a `scheduled` handler if deployed to an environment with native Cron Triggers. Merely setting CRON_SECRET does not provision a schedule.

The maintenance task retries due jobs, polls accepted messages for delivery confirmation, resumes queries awaiting provider setup, and recovers processing queries older than five minutes. The portal's Refresh delivery button also polls provider status and drains due message jobs. External scheduling is not provisioned by this repository.

## Evaluator walkthrough

1. Configure the three providers and TEST_EMAIL / TEST_WHATSAPP. Join the Twilio sandbox from the evaluation number, or configure an approved WhatsApp sender and content template.
2. Open a sample patient and inspect/download the original documents. Add a real evaluation patient if desired; record consent and both contacts.
3. Upload patient documents before uploading the insurer query. PDF, PNG, JPEG, WEBP and TXT are supported up to 10 MB each. Image/PDF extraction requires Gemini.
4. Upload a never-seen query letter or paste its text. The server extracts every point, checks claim-scoped documents and patient-wide policy/identity records, validates evidence citations, renders the configured template, and submits both channels when the analysis is unambiguous.
5. Inspect Query history: every point has a result, reason and evidence where present. An available result must quote actual document text and reference an authorized, readable document.
6. Inspect Messages: `Provider accepted` means the provider accepted submission; `Delivered` appears only after provider confirmation. Each channel can fail independently and retains its error and attempts.
7. Upload the identical query again: the duplicate fingerprint returns the existing record and does not create another send job. Simultaneous duplicate inserts are also constrained by a database unique index.
8. Edit Settings → Patient message template to match the supplied assignment template. Required placeholders are `{{patient_name}}` and `{{requests}}`; optional placeholders are shown in the UI.

## Access and data handling

- Every patient, document, query, message and audit lookup is scoped to the authenticated user ID. File downloads authorize against metadata before reading R2. All query inputs and provider results are rendered as text, not HTML.
- Write APIs require a same-origin Origin header. The production private Site adds its own sign-in/access boundary. Keep the Site private. This version provides isolated account workspaces, not shared clinical team roles or patient self-service accounts.
- Original files are private objects; downloaded documents use attachment disposition and no-store caching. PDFs and images are sent to Gemini for extraction when configured. Extracted text and query content are sent for semantic matching. Rendered messages are sent only to the configured communication providers.
- Uploaded instructions are treated as untrusted document data. All-readability checks and exact evidence validation reduce unsupported matches. LLM accuracy still needs evaluation against the supplied assessment corpus; an exact citation does not prove clinical correctness.
- Historical responses are immutable once accepted, delivered or uncertain. Reanalysis before submission uses the current locker. Review cases do not auto-send, to avoid requesting the wrong documents.
- This implementation does not claim regulatory certification, universal OCR accuracy, guaranteed WhatsApp acceptance, or tested real delivery without credentials. Set operational retention, provider agreements and deployment policy before using actual patient data.

## Tests

```powershell
node --test tests/domain.test.mjs tests/providers.test.mjs
npx tsc --noEmit
npm run build
# With a local development server running:
node tests/api-smoke.mjs
```

The provider tests use SQLite and mocked external APIs to exercise the real server processing functions. They verify two-channel automatic submission, independent channel outcomes, evidence checks, existing-document exclusion, consent gates, retry handling, and account isolation. They do not contact real recipients. The API smoke test uploads a synthetic query to the local preview, verifies persistence/deduplication, download authorization, CSRF checks, and validation. Browser visual verification was unavailable in the authoring environment.

Provider contracts: [Gemini document processing](https://ai.google.dev/gemini-api/docs/document-processing), [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
