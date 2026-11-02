import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error('Configure Supabase URL and service role key.');
const client = createClient(url, key, { auth: { persistSession: false } });
const name = process.env.SUPABASE_STORAGE_BUCKET || 'patient-documents';
const options = { public: false, fileSizeLimit: 10 * 1024 * 1024 };
const { data: buckets, error: listError } = await client.storage.listBuckets();
if (listError) throw listError;
const { error } = buckets.some((b) => b.id === name)
  ? await client.storage.updateBucket(name, options)
  : await client.storage.createBucket(name, options);
if (error) throw error;
console.log('Private storage bucket configured with a 10 MB limit.');
