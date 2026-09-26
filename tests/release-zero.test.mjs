import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {offerKindForListing} from '../src/lib/offer-kind.ts';
import {validatePolicy} from '../src/lib/policies.ts';

async function database() {
  const db=new PGlite();
  const sql=readFileSync('db/001_foundation.sql','utf8')
    .replace('create extension if not exists pgcrypto;','')
    .replace(/do \$\$ declare t text; begin[\s\S]*?end \$\$;/,'')
    .replace('revoke all on all sequences in schema public from anon, authenticated;','');
  await db.exec(sql);
  await db.exec(readFileSync('db/003_room_draft_revision.sql','utf8'));
  return db;
}

test('listing intent maps to the exact agreement kind',()=>{
  assert.equal(offerKindForListing('swap'),'bond');
  assert.equal(offerKindForListing('loan'),'loan');
  assert.equal(offerKindForListing('gift'),'gift');
});

test('staff policy values require the exact effective fields',()=>{
  assert.deepEqual(validatePolicy('feature_flags',{listingsEnabled:false,offersEnabled:true,roomPublishingEnabled:true}),{listingsEnabled:false,offersEnabled:true,roomPublishingEnabled:true});
  assert.throws(()=>validatePolicy('feature_flags',{}));
  assert.throws(()=>validatePolicy('discovery',{publicListingsEnabled:true,publicRoomsEnabled:true,unknown:true}));
});

test('stale Room writes cannot overwrite a newer draft',async()=>{
  const db=await database();
  try {
    const user=crypto.randomUUID();
    await db.query('insert into profiles(id,handle,display_name) values($1,$2,$3)',[user,'room_reader','Room Reader']);
    await db.query('insert into rooms(user_id) values($1)',[user]);
    const saved=await db.query('update rooms set draft=$2,draft_version=draft_version+1 where user_id=$1 and draft_version=$3 returning draft_version',[user,{light:40,objects:[]},0]);
    assert.equal(saved.rows[0].draft_version,1);
    const roomId=(await db.query('select id from rooms where user_id=$1',[user])).rows[0].id;
    await db.query('insert into room_draft_versions(room_id,version,scene,name,mood) values($1,$2,$3,$4,$5)',[roomId,1,{light:40,objects:[]},'Study','study']);
    const stale=await db.query('update rooms set draft=$2,draft_version=draft_version+1 where user_id=$1 and draft_version=$3 returning draft_version',[user,{light:90,objects:[]},0]);
    assert.equal(stale.rows.length,0);
    const stalePublish=await db.query('update rooms set published=draft,version=version+1 where user_id=$1 and draft_version=$2 returning version',[user,0]);
    assert.equal(stalePublish.rows.length,0);
    const published=await db.query('update rooms set published=draft,version=version+1 where user_id=$1 and draft_version=$2 returning version',[user,1]);
    assert.equal(published.rows[0].version,1);
    const room=await db.query('select draft,draft_version from rooms where user_id=$1',[user]);
    assert.equal(room.rows[0].draft.light,40);
    assert.equal(room.rows[0].draft_version,1);
    const prior=(await db.query('select scene from room_draft_versions where room_id=$1 and version=1',[roomId])).rows[0];
    assert.equal(prior.scene.light,40);
  } finally {await db.close()}
});

test('Leaflet balance includes journal rows beyond the first page',async()=>{
  const db=await database();
  try {
    const user=crypto.randomUUID();
    await db.query('insert into profiles(id,handle,display_name) values($1,$2,$3)',[user,'ledger_reader','Ledger Reader']);
    const account=(await db.query("insert into leaflet_accounts(user_id,kind) values($1,'available') returning id",[user])).rows[0].id;
    const platform=(await db.query("insert into leaflet_accounts(user_id,kind) values(null,'issuance') returning id")).rows[0].id;
    for(let i=0;i<105;i++) {
      const journal=(await db.query('insert into leaflet_journals(event_key,source) values($1,$2) returning id',[`test-${i}`,'bond_settlement'])).rows[0].id;
      await db.query('insert into leaflet_postings(journal_id,account_id,amount) values($1,$2,1),($1,$3,-1)',[journal,account,platform]);
    }
    const recent=await db.query('select p.amount from leaflet_postings p where account_id=$1 order by id desc limit 100',[account]);
    assert.equal(recent.rows.length,100);
    const total=await db.query('select coalesce(sum(p.amount),0)::int as amount from leaflet_accounts a left join leaflet_postings p on p.account_id=a.id where a.user_id=$1 and a.kind=$2',[user,'available']);
    assert.equal(total.rows[0].amount,105);
  } finally {await db.close()}
});
