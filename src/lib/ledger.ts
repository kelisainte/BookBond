import type { Tx } from './db';
import { requireValue } from './validation';
export async function ensureAccount(tx: Tx, userId: string | null, kind: 'issuance'|'available'|'pending'|'held'|'spent') {
  const { rows } = await tx.query<{id:string}>(
    userId ? 'insert into leaflet_accounts(user_id,kind) values($1,$2) on conflict(user_id,kind) do update set kind=excluded.kind returning id' :
      'insert into leaflet_accounts(user_id,kind) values(null,$2) on conflict(kind) where user_id is null do update set kind=excluded.kind returning id',
    [userId,kind]); return rows[0].id;
}
export async function postBalanced(tx: Tx, eventKey: string, source: string, entries: {userId:string|null;kind:'issuance'|'available'|'pending'|'held'|'spent';amount:number}[], actor: string|null = null, reason: string|null = null) {
  requireValue(entries.length >= 2 && entries.reduce((sum,e)=>sum+e.amount,0) === 0, 'Unbalanced journal');
  const existing = await tx.query('select id from leaflet_journals where event_key=$1',[eventKey]);
  if (existing.rowCount) return false;
  const { rows } = await tx.query<{id:string}>('insert into leaflet_journals(event_key,source,actor_id,reason) values($1,$2,$3,$4) returning id',[eventKey,source,actor,reason]);
  for (const entry of entries) {
    requireValue(Number.isSafeInteger(entry.amount) && entry.amount !== 0, 'Invalid journal amount');
    const account = await ensureAccount(tx,entry.userId,entry.kind);
    await tx.query('insert into leaflet_postings(journal_id,account_id,amount) values($1,$2,$3)',[rows[0].id,account,entry.amount]);
  }
  return true;
}
export async function balance(tx: Tx, userId:string, kind='available') {
  const {rows} = await tx.query<{balance:string}>('select coalesce(sum(p.amount),0)::text as balance from leaflet_postings p join leaflet_accounts a on a.id=p.account_id where a.user_id=$1 and a.kind=$2',[userId,kind]);
  return Number(rows[0].balance);
}
