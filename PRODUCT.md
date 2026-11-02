# Product and operations guide

## Evaluation walkthrough

1. Follow the setup instructions in [README.md](README.md), then sign in with a provisioned Supabase account.
2. Load the fictional workspace explicitly. The 10 profiles, 35 text documents, and four sample analyses are examples, not live model output.
3. Configure Gemini and your communication providers. Set `TEST_EMAIL` and `TEST_WHATSAPP` to your actual evaluation destinations; fictional profiles cannot send without overrides.
4. Open a patient and inspect/download existing documents. Add documents before the query letter. Supported formats: PDF, PNG, JPEG, WEBP, and TXT, up to 10 MB per file.
5. Upload a new query letter or paste text. The pipeline extracts the requests, checks claim-scoped documents and patient-wide policy/identity records, validates evidence, and renders the message template.
6. Review each result in Query history. Available results must cite readable, authorized documents and quote their actual text. Ambiguous results remain in review and do not auto-send.
7. Inspect Messages. Email and WhatsApp have independent outcomes. Provider acceptance is not confirmed delivery.
8. Upload the same query again. Duplicate fingerprints return the existing record instead of creating another message pair.
9. Adjust the template in Settings. Required placeholders: `{{patient_name}}` and `{{requests}}`. Optional placeholders: `{{patient_id}}`, `{{claim_id}}`, `{{insurer}}`, `{{available}}`.

## Authentication and private files

The app uses Supabase email/password sessions and verifies users on the server. No identity is accepted from client-supplied user headers. Disable public sign-ups in Supabase and provision accounts explicitly. Supabase handles password verification and authentication rate limits. Password recovery and self-service account administration are not implemented in this UI.

Every record lookup is scoped to the verified user ID. Writes require a same-origin Origin header. This is an account-private workspace, not a shared clinical team or patient self-service product.

Upload authorization first checks ownership of the selected patient, then issues a signed URL for a random object key inside that user's patient prefix. The browser uploads directly to Supabase. The processing endpoint rechecks ownership, object path, extension, and file size. Storage setup enforces the bucket's 10 MB limit. Files are immutable through the app's signed-upload flow.

Downloads check record ownership before issuing a short-lived signed URL. A recipient holding that URL can use it until it expires. Never make the bucket public or add permissive storage policies. The service-role key remains server-only.

## Analysis and delivery

PDFs/images are sent to Gemini for extraction when configured. Extracted text and query content are sent for matching. Uploaded instructions are treated as document data. Exact evidence validation reduces unsupported matches, but does not establish clinical correctness.

Without Gemini, conservative candidate matching produces an analysis-setup state and never silently marks documents missing or sends guessed requests. TXT content can be extracted without Gemini.

Resend requires a verified sender. Twilio sandbox recipients must join the sandbox. Business-initiated WhatsApp messages may require an approved template; `TWILIO_CONTENT_SID` uses variable `1` for the rendered message. Provider restrictions still apply.

Real patient communication requires recorded consent. Test destinations override the profile destinations when present. Job recipients are snapshotted; use the explicit retry action after correcting contacts or changing test overrides.

## Retries and scheduling

The initial query request attempts analysis and both delivery channels. Jobs persist before provider submission. Retryable failures back off exponentially and stop after five attempts. Accepted messages are not resent.

A lost WhatsApp acknowledgment is marked uncertain because the provider may already have accepted the message. Inspect the provider console before any manual remediation. Stale sending jobs are also marked uncertain.

`/api/cron` accepts GET or POST with `Authorization: Bearer <CRON_SECRET>`. It awaits its work inside the Vercel Function, resumes at most one pending/stale query per invocation, drains due jobs within a time budget, and polls delivery confirmations. Functions have a 300-second configured maximum duration. Remaining work waits for the next invocation or an explicit UI action.

The included cron runs once daily. This does not guarantee minute-level retries; configure a more frequent supported schedule for that behavior. If Vercel Deployment Protection is enabled, an external scheduler also needs the platform's approved protection-bypass mechanism. Do not put scheduler secrets in public URLs or client code.

## Existing Cloudflare data

This code migration does not transfer a previously hosted D1 database or R2 files automatically. The previous source remains in Git history at commit `004ca05`.

For an existing deployment, take a backup and perform a separately verified data migration before switching traffic:

1. Export D1 records and jobs and copy R2 originals to the private Supabase bucket.
2. Create the corresponding Supabase users and map old Sites owner IDs to their new verified user IDs.
3. Rewrite `owner` columns and object-key prefixes consistently; preserve record IDs, fingerprints, job states, and provider IDs.
4. Restore into a staging database first. An imported database without Drizzle's migration journal needs baselining rather than replaying the table-creation migrations.
5. Verify per-account isolation, original downloads, query history, and delivery states before directing users to Vercel. Never reset accepted or uncertain jobs to queued during migration.

No remote credentials or existing production data were supplied with the repository. Remote migration, real provider delivery, and hosted end-to-end verification require the configured accounts.

## Checks and limits

`npm run check` verifies TypeScript, formatting, domain behavior, mocked delivery, the actual libSQL adapter/migrations, and API authorization boundaries. `npm run build` produces the native Next.js deployment. `npm run test:smoke` additionally exercises a local running app with a real dedicated Supabase test account.

No regulatory certification, universal OCR accuracy, or guaranteed provider delivery is claimed. Retention, provider agreements, backup policy, and operational access controls require deployment-specific decisions before using real patient data. Failed or abandoned direct uploads may leave unreferenced private objects; audit them before any retention cleanup.
