import { requireChatGPTUser } from './chatgpt-auth';
import Portal from './portal';
export const dynamic = 'force-dynamic';
export default async function Home(){await requireChatGPTUser('/');return <Portal/>;}
