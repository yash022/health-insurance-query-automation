import { env } from '../../../lib/runtime';
import { getUser } from '../../../lib/auth';
import {
  audit,
  drain,
  extract,
  get,
  integrationStatus,
  list,
  messages,
  processQuery,
  put,
  refreshDelivery,
  seed,
  settings,
  uid,
} from '../../../lib/server';
import { categories, classify } from '../../../lib/domain';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
async function handle(req: Request) {
  try {
    const user = await getUser();
    if (!user)
      return Response.json(
        { error: 'Sign in to access this patient locker.' },
        { status: 401 },
      );
    const owner = user.userId,
      url = new URL(req.url),
      path = url.pathname.replace('/api/', '');
    if (req.method !== 'GET' && req.headers.get('origin') !== url.origin)
      return Response.json(
        { error: 'Invalid request origin.' },
        { status: 403 },
      );
    if (req.method === 'GET') {
      if (path === 'state') {
        const [patients, documents, queries, outbox, events, config] =
          await Promise.all([
            list(owner, 'patient'),
            list(owner, 'document'),
            list(owner, 'query'),
            messages(owner),
            list(owner, 'audit'),
            settings(owner),
          ]);
        return Response.json(
          {
            patients,
            documents,
            queries,
            messages: outbox,
            events: events.slice(0, 100),
            config,
            integrations: integrationStatus(),
            user: { name: user.displayName, email: user.email },
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (path.startsWith('file/')) {
        const id = path.slice(5);
        let record;
        try {
          record = await get(owner, id, 'document');
        } catch {
          record = await get(owner, id, 'query');
        }
        if (!record.key) throw new Error('This example has no attached file.');
        const location = await env.BUCKET.signDownload(record.key, record.name);
        await audit(owner, `Downloaded ${record.name}`, record.patient);
        return new Response(null, {
          status: 302,
          headers: {
            Location: location,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    }
    if (req.method === 'POST') {
      if (path === 'upload-url') {
        const body = await req.json();
        const patient = await get(owner, String(body.patient), 'patient');
        const key = `${owner}/${patient.id}/${uid()}`;
        return Response.json(await env.BUCKET.signUpload(key), {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      if (path === 'seed') {
        await seed(owner);
        return Response.json({ ok: true });
      }
      if (path === 'upload') {
        const form = await req.formData(),
          patient = await get(owner, String(form.get('patient')), 'patient'),
          kind = form.get('kind') === 'query' ? 'query' : 'document';
        let file = form.get('file') as File | null;
        const uploadedKey = String(form.get('storageKey') || '');
        if (uploadedKey) {
          const prefix = `${owner}/${patient.id}/`;
          if (
            !uploadedKey.startsWith(prefix) ||
            !/^[a-f0-9-]{36}$/.test(uploadedKey.slice(prefix.length))
          ) {
            throw new Error('Invalid upload reference.');
          }
          const object = await env.BUCKET.get(uploadedKey);
          if (!object) throw new Error('Uploaded file not found.');
          file = new File(
            [await object.arrayBuffer()],
            String(form.get('name') || ''),
          );
        }
        const manual = String(form.get('text') || '').trim();
        if (!file && !manual) throw new Error('Choose a file or paste text.');
        if (file && file.size > 10 * 1024 * 1024)
          throw new Error('Maximum upload size is 10 MB.');
        if (file && !/\.(pdf|png|jpe?g|webp|txt)$/i.test(file.name))
          throw new Error('Upload PDF, PNG, JPG, WEBP or TXT.');
        if (manual.length > 180000) throw new Error('Pasted text is too long.');
        const name =
            file?.name ||
            String(
              form.get('name') ||
                (kind === 'query'
                  ? 'Insurer query'
                  : form.get('category') + ' — pasted text'),
            ),
          id = uid();
        const bytes = file
          ? await file.arrayBuffer()
          : new TextEncoder().encode(manual);
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        )
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const duplicate = (await list(owner, kind, patient.id)).find(
          (r) => r.hash === hash,
        );
        if (duplicate)
          return Response.json({ ok: true, duplicate: true, id: duplicate.id });
        const key = uploadedKey || `${owner}/${patient.id}/${id}`;
        if (!uploadedKey) await env.BUCKET.put(key, bytes);
        let text = manual,
          error = null;
        if (!text && file) {
          try {
            text = await extract(file);
          } catch (e: any) {
            error = e.message;
          }
        }
        const category = String(form.get('category') || classify(text || name));
        if (kind === 'document' && !categories.includes(category))
          throw new Error('Invalid document category.');
        const record = await put(
          owner,
          kind,
          {
            name,
            key,
            hash,
            text,
            error,
            size: file?.size || manual.length,
            status: error
              ? 'extraction_failed'
              : kind === 'query'
                ? 'processing'
                : 'ready',
            category,
            claim: form.get('scope') === 'patient' ? '' : patient.claim,
            synthetic: patient.synthetic,
          },
          patient.id,
          id,
        );
        await audit(owner, `Uploaded ${kind}: ${name}`, patient.id);
        if (kind === 'query' && !error) await processQuery(owner, record);
        return Response.json({ ok: true, id });
      }
      const b: any = await req.json();
      if (path === 'patient') {
        if (
          !String(b.name || '').trim() ||
          !String(b.patientId || '').trim() ||
          !String(b.claim || '').trim() ||
          !String(b.insurer || '').trim()
        )
          throw new Error(
            'Name, patient ID, insurer and claim ID are required.',
          );
        if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))
          throw new Error('Enter a valid email.');
        if (b.phone && !/^\+[1-9]\d{7,14}$/.test(b.phone))
          throw new Error(
            'Use international phone format, e.g. +919876543210.',
          );
        const existing = b.id ? await get(owner, b.id, 'patient') : null;
        if (
          (await list(owner, 'patient')).some(
            (p) => p.patientId === b.patientId && p.id !== b.id,
          )
        )
          throw new Error('Patient ID already exists.');
        if (
          existing &&
          b.claim !== existing.claim &&
          (await list(owner, 'query', b.id)).length
        )
          throw new Error(
            'Claim ID cannot change after queries exist. Create a separate patient claim record.',
          );
        const fields = [
          'name',
          'patientId',
          'email',
          'phone',
          'insurer',
          'claim',
          'policy',
          'hospital',
          'gender',
          'age',
        ];
        const data: any = { ...existing };
        fields.forEach((k) => (data[k] = String(b[k] || '').slice(0, 250)));
        data.consent = !!b.consent;
        data.synthetic = existing?.synthetic || false;
        const p = await put(owner, 'patient', data, null, b.id || uid());
        await audit(
          owner,
          existing ? 'Patient profile updated' : 'Patient created',
          p.id,
        );
        return Response.json({ ok: true, id: p.id });
      }
      if (path === 'settings') {
        const template = String(b.template || '');
        if (
          template.length > 12000 ||
          !template.includes('{{requests}}') ||
          !template.includes('{{patient_name}}')
        )
          throw new Error(
            'Template must include {{patient_name}} and {{requests}} and be below 12,000 characters.',
          );
        const tokens = template.match(/\{\{\w+\}\}/g) || [];
        if (
          tokens.some(
            (t) =>
              ![
                '{{patient_name}}',
                '{{patient_id}}',
                '{{claim_id}}',
                '{{insurer}}',
                '{{requests}}',
                '{{available}}',
              ].includes(t),
          )
        )
          throw new Error('Unknown template placeholder.');
        const current = await settings(owner);
        await put(owner, 'settings', { template }, null, current.id || uid());
        await audit(owner, 'Message template updated');
        return Response.json({ ok: true });
      }
      if (path === 'reanalyze') {
        const q = await get(owner, b.id, 'query');
        if (
          (await messages(owner)).some(
            (m) =>
              m.query === q.id &&
              ['accepted', 'delivered', 'sending', 'uncertain'].includes(
                m.status,
              ),
          )
        )
          throw new Error(
            'Messages already submitted or awaiting reconciliation. This query cannot be reprocessed.',
          );
        const lock = await (env as any).DB.prepare(
          "UPDATE records SET data=json_set(data,'$.status','processing') WHERE owner=? AND id=? AND json_extract(data,'$.status')!='processing'",
        )
          .bind(owner, q.id)
          .run();
        if (!lock.meta.changes)
          throw new Error('This query is already processing.');
        await (env as any).DB.prepare(
          'DELETE FROM jobs WHERE owner=? AND query=?',
        )
          .bind(owner, q.id)
          .run();
        await processQuery(owner, q);
        return Response.json({ ok: true });
      }
      if (path === 'extract') {
        const d = await get(owner, b.id, 'document'),
          obj = await (env as any).BUCKET.get(d.key);
        if (!obj) throw new Error('File not found.');
        const text = await extract(new File([await obj.arrayBuffer()], d.name));
        await put(
          owner,
          'document',
          { ...d, text, error: null, status: 'ready' },
          d.patient,
          d.id,
        );
        await audit(owner, `Re-extracted ${d.name}`, d.patient);
        return Response.json({ ok: true });
      }
      if (path === 'archive-document') {
        const d = await get(owner, b.id, 'document');
        const status =
          d.status === 'archived'
            ? d.text
              ? 'ready'
              : 'extraction_failed'
            : 'archived';
        await put(owner, 'document', { ...d, status }, d.patient, d.id);
        await audit(
          owner,
          `${status === 'archived' ? 'Archived' : 'Restored'} document: ${d.name}`,
          d.patient,
        );
        return Response.json({ ok: true });
      }
      if (path === 'retry') {
        const m = (await messages(owner)).find((m) => m.id === b.id);
        if (!m) throw new Error('Message not found.');
        if (!['failed', 'blocked', 'retry'].includes(m.status))
          throw new Error('This message cannot safely be retried.');
        const p = await get(owner, m.patient, 'patient'),
          e = env as any;
        const recipient =
          m.channel === 'email'
            ? e.TEST_EMAIL || p.email
            : e.TEST_WHATSAPP || p.phone;
        await e.DB.prepare(
          "UPDATE jobs SET status='queued',next=0,attempts=0,data=? WHERE owner=? AND id=?",
        )
          .bind(JSON.stringify({ ...m, recipient }), owner, m.id)
          .run();
        await drain(owner, m.query);
        return Response.json({ ok: true });
      }
      if (path === 'refresh-delivery') {
        await refreshDelivery(owner);
        await drain(owner);
        return Response.json({ ok: true });
      }
    }
    return Response.json({ error: 'Not found.' }, { status: 404 });
  } catch (e: any) {
    return Response.json(
      { error: e.message || 'Request failed.' },
      { status: e.message === 'Record not found.' ? 404 : 400 },
    );
  }
}
export const GET = handle;
export const POST = handle;
