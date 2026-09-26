import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';

async function schema() {
 const db=new PGlite();
 let sql=readFileSync('db/001_foundation.sql','utf8');
 // PGlite has no Supabase anon/authenticated roles or storage schema; only omit those platform grants.
 sql=sql.replace('create extension if not exists pgcrypto;','').replace(/do \$\$ declare t text; begin[\s\S]*?end \$\$;/,'').replace('revoke all on all sequences in schema public from anon, authenticated;','');
 await db.exec(sql);return db;
}

test('copy identities, active tag pairing and status constraints',async()=>{
 const db=await schema();
 try {
  const userA=crypto.randomUUID(),userB=crypto.randomUUID();
  await db.query('insert into profiles(id,handle,display_name) values($1,$2,$3),($4,$5,$6)',[userA,'reader_a','Reader A',userB,'reader_b','Reader B']);
  const work=(await db.query("insert into works(title,author) values('A Book','A Writer') returning id")).rows[0].id;
  const edition=(await db.query('insert into editions(work_id) values($1) returning id',[work])).rows[0].id;
  const copy=(await db.query("insert into copies(edition_id,owner_id,holder_id,condition) values($1,$2,$2,'Good') returning id",[edition,userA])).rows[0].id;
  assert.notEqual(copy,edition);
  await db.query("insert into tags(public_code,copy_id,status) values('tag-one',$1,'paired')",[copy]);
  await assert.rejects(db.query("insert into tags(public_code,copy_id,status) values('tag-two',$1,'paired')",[copy]),/unique/i);
  await db.query("update tags set status='retired' where public_code='tag-one'");
  await db.query("insert into tags(public_code,copy_id,status) values('tag-two',$1,'paired')",[copy]);
  await assert.rejects(db.query("update copies set status='imaginary' where id=$1",[copy]),/check constraint/i);
  assert.equal((await db.query('select owner_id,holder_id from copies where id=$1',[copy])).rows[0].owner_id,userA);
 }finally{await db.close()}
});

test('one agreement keeps distinct copy legs and an immutable event sequence',async()=>{
 const db=await schema();
 try {
  const [a,b]=[crypto.randomUUID(),crypto.randomUUID()];
  await db.query('insert into profiles(id,handle,display_name) values($1,$2,$3),($4,$5,$6)',[a,'reader_a','A',b,'reader_b','B']);
  const w=(await db.query("insert into works(title,author) values('Trade','Author') returning id")).rows[0].id;
  const e=(await db.query('insert into editions(work_id) values($1) returning id',[w])).rows[0].id;
  const c1=(await db.query("insert into copies(edition_id,owner_id,holder_id,condition) values($1,$2,$2,'Good') returning id",[e,a])).rows[0].id;
  const c2=(await db.query("insert into copies(edition_id,owner_id,holder_id,condition) values($1,$2,$2,'Good') returning id",[e,b])).rows[0].id;
  const offer=(await db.query("insert into offers(kind,proposer_id,recipient_id) values('bond',$1,$2) returning id",[a,b])).rows[0].id;
  await db.query('insert into delivery_legs(offer_id,copy_id,sender_id,recipient_id) values($1,$2,$3,$4),($1,$5,$4,$3)',[offer,c1,a,b,c2]);
  await assert.rejects(db.query('insert into delivery_legs(offer_id,copy_id,sender_id,recipient_id) values($1,$2,$3,$4)',[offer,c1,a,b]),/unique/i);
  assert.equal((await db.query('select count(*)::int as n from delivery_legs where offer_id=$1',[offer])).rows[0].n,2);
  await db.query("insert into passport_events(copy_id,event_type,actor_id,transaction_id) values($1,'registered',$2,$3),($1,'reserved',$2,$3)",[c1,a,offer]);
  assert.deepEqual((await db.query('select event_type from passport_events where copy_id=$1 order by id',[c1])).rows.map(r=>r.event_type),['registered','reserved']);
 }finally{await db.close()}
});
