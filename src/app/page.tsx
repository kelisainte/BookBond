import { Dashboard } from '@/components/dashboard';
import { authConfigured } from '@/lib/auth';
import { databaseConfigured } from '@/lib/db';
import { currentUser } from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function Home() {
  const configured=authConfigured()&&databaseConfigured();
  const user=configured?await currentUser():null;
  return <Dashboard configured={configured} signedIn={Boolean(user)} userId={user?.id??null}/>;
}
