import { timingSafeEqual } from 'node:crypto';
import { tick } from '../../../lib/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return new Response('Unauthorized', { status: 401 });
  }
  await tick();
  return Response.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export const POST = GET;
