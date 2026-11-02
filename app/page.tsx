import { requireUser } from '../lib/auth';
import Portal from './portal';
export const dynamic = 'force-dynamic';
export default async function Home() {
  await requireUser();
  return <Portal />;
}
