import 'server-only';
import { createClient } from '@supabase/supabase-js';

function bucket() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configure Supabase private storage.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'patient-documents');
}

export const storage = {
  async put(key: string, value: string | ArrayBuffer | Uint8Array) {
    const body = typeof value === 'string' ? new Blob([value]) : value;
    const { error } = await bucket().upload(key, body, { upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  },
  async get(key: string) {
    const { data, error } = await bucket().download(key);
    if (error) throw new Error(`Storage download failed: ${error.message}`);
    if (!data) return null;
    return { body: data.stream(), arrayBuffer: () => data.arrayBuffer() };
  },
  async signUpload(key: string) {
    const { data, error } = await bucket().createSignedUploadUrl(key, {
      upsert: false,
    });
    if (error) throw new Error(`Cannot authorize upload: ${error.message}`);
    return {
      key,
      token: data.token,
      bucket: process.env.SUPABASE_STORAGE_BUCKET || 'patient-documents',
    };
  },
  async signDownload(key: string, filename: string) {
    const { data, error } = await bucket().createSignedUrl(key, 60, {
      download: filename,
    });
    if (error) throw new Error(`Cannot authorize download: ${error.message}`);
    return data.signedUrl;
  },
};
