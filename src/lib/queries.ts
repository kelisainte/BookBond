import { many, one } from './db';
import { DomainError, requireValue } from './validation';
import {policyDefaults,validatePolicy} from './policies';

export async function view(scope:string,user:string|null,query:URLSearchParams) {
  const mine=()=>requireValue(user,'Sign in to continue',401);
  if(scope==='public') {
    const policyRows=await many<{key:string;value:unknown}>("select key,value from policies where key in ('discovery','service_notices')");
    const configured=Object.fromEntries(policyRows.map(p=>[p.key,validatePolicy(p.key as 'discovery'|'service_notices',p.value)]));
    const discovery=(configured.discovery??policyDefaults.discovery) as typeof policyDefaults.discovery;
    const notices=(configured.service_notices??policyDefaults.service_notices) as typeof policyDefaults.service_notices;
    const term=(query.get('q')??'').trim().slice(0,120);
    const kind=query.get('kind')??'all';
    requireValue(['all','swap','loan','gift'].includes(kind),'Invalid listing filter');
    const rawCursor=query.get('cursor');
    let cursor:{date:string;id:string}|null=null;
    if(rawCursor) {
      try { cursor=JSON.parse(Buffer.from(rawCursor,'base64url').toString('utf8')); }
      catch { throw new DomainError('Invalid page cursor'); }
      requireValue(cursor && !Number.isNaN(Date.parse(cursor.date)) && /^[0-9a-f-]{36}$/i.test(cursor.id),'Invalid page cursor');
    }
    const values=[`%${term}%`,kind,cursor?.date??null,cursor?.id??null];
    const where=`c.audience='public' and c.status='available' and l.active=true and p.visibility='public'
      and ($1='' or w.title ilike $1 or w.author ilike $1 or p.handle ilike $1)
      and ($2='all' or l.kind=$2)`;
    const [copyRows,rooms,circles,copyCount,readers]=await Promise.all([
      many(`select c.id,c.condition,c.condition_notes,c.special_features,c.status,c.owner_id,c.created_at,
        w.title,w.author,e.isbn,e.format,e.language,l.kind,l.terms,l.acceptable,l.shipping_allowed,
        p.handle,p.display_name,p.city,
        (select id from copy_photos ph where ph.copy_id=c.id and ph.kind='front' order by created_at limit 1) as front_photo
        from copies c join editions e on e.id=c.edition_id join works w on w.id=e.work_id
        join listings l on l.copy_id=c.id join profiles p on p.id=c.owner_id
        where ${where} and ($3::timestamptz is null or (c.created_at,c.id)<($3::timestamptz,$4::uuid))
        order by c.created_at desc,c.id desc limit 31`,[term?values[0]:'',...values.slice(1)]),
      many(`select r.id,r.name,r.mood,r.version,p.id as user_id,p.handle,p.display_name from rooms r join profiles p on p.id=r.user_id where r.audience='public' and p.visibility='public' order by r.updated_at desc limit 30`),
      many(`select c.id,c.name,c.description,c.current_title,p.handle as host from circles c join profiles p on p.id=c.host_id where c.audience='public' order by c.created_at desc limit 30`),
      one<{copies:string}>(`select count(*)::text as copies from copies c join editions e on e.id=c.edition_id join works w on w.id=e.work_id join listings l on l.copy_id=c.id join profiles p on p.id=c.owner_id where ${where}`,[term?values[0]:'',kind]),
      one<{readers:string}>(`select count(*)::text as readers from profiles where visibility='public'`)
    ]);
    const copies=copyRows.slice(0,30),last=copies.at(-1);
    const nextCursor=copyRows.length>30 && last?Buffer.from(JSON.stringify({date:last.created_at,id:last.id})).toString('base64url'):null;
    return {copies:discovery.publicListingsEnabled?copies:[],rooms:discovery.publicRoomsEnabled?rooms:[],circles,counts:{copies:discovery.publicListingsEnabled?copyCount?.copies??'0':'0',readers:readers?.readers??'0'},nextCursor:discovery.publicListingsEnabled?nextCursor:null,serviceNotice:notices.message};
  }
  if(scope==='me') {
    mine();
    const [profile,copies,wishlist,reads,offers,loans,room,roomHistory,binders,circles,ledger,accountBalances,cases,messages,roles] = await Promise.all([
      one('select * from profiles where id=$1',[user]),
      many(`select c.*,w.title,w.author,e.isbn,e.format,l.kind,l.terms,l.acceptable,l.active,l.shipping_allowed,
        (select id from copy_photos ph where ph.copy_id=c.id and ph.kind='front' order by created_at limit 1) as front_photo
        from copies c join editions e on e.id=c.edition_id join works w on w.id=e.work_id
        left join listings l on l.copy_id=c.id where c.owner_id=$1 or c.holder_id=$1
        order by c.created_at desc`,[user]),
      many('select * from wishlists where user_id=$1 order by created_at desc',[user]),
      many('select * from reading_entries where user_id=$1 order by updated_at desc',[user]),
      many(`select o.*, pp.handle as proposer_handle,rp.handle as recipient_handle,
        (select json_agg(json_build_object('id',i.copy_id,'sender_id',i.sender_id,'recipient_id',i.recipient_id,'title',w.title,'condition',c.condition)) from offer_items i join copies c on c.id=i.copy_id join editions e on e.id=c.edition_id join works w on w.id=e.work_id where i.offer_id=o.id) as items,
        (select coalesce(json_agg(json_build_object('id',d.id,'copy_id',d.copy_id,'sender_id',d.sender_id,'recipient_id',d.recipient_id,'status',d.status,'tracking',d.tracking_reference)),'[]'::json) from delivery_legs d where d.offer_id=o.id) as legs
        from offers o join profiles pp on pp.id=o.proposer_id join profiles rp on rp.id=o.recipient_id
        where o.proposer_id=$1 or o.recipient_id=$1 order by o.updated_at desc`,[user]),
      many(`select l.*,w.title from loans l join copies c on c.id=l.copy_id join editions e on e.id=c.edition_id join works w on w.id=e.work_id where l.owner_id=$1 or l.borrower_id=$1 order by l.id desc`,[user]),
      one('select * from rooms where user_id=$1',[user]),
      many('select v.version,v.created_at,v.name,v.mood from room_draft_versions v join rooms r on r.id=v.room_id where r.user_id=$1 order by v.version desc limit 20',[user]),
      many(`select b.*,(select coalesce(json_agg(bc.copy_id),'[]'::json) from binder_copies bc where bc.binder_id=b.id) as copies from binders b where b.user_id=$1 order by position,name`,[user]),
      many(`select c.* from circles c join circle_members m on m.circle_id=c.id where m.user_id=$1 order by c.created_at desc`,[user]),
      many(`select j.id,j.event_key,j.source,j.created_at,a.kind,p.amount from leaflet_postings p join leaflet_accounts a on a.id=p.account_id join leaflet_journals j on j.id=p.journal_id where a.user_id=$1 order by j.created_at desc limit 100`,[user]),
      many<{kind:string;amount:string}>(`select a.kind,coalesce(sum(p.amount),0)::text as amount from leaflet_accounts a left join leaflet_postings p on p.account_id=a.id where a.user_id=$1 group by a.kind`,[user]),
      many('select * from cases where reporter_id=$1 order by created_at desc',[user]),
      many(`select m.*,p.handle as other_handle from messages m join profiles p on p.id=case when m.sender_id=$1 then m.recipient_id else m.sender_id end where m.sender_id=$1 or m.recipient_id=$1 order by m.created_at desc limit 100`,[user]),
      many<{role:string}>('select role from staff_roles where user_id=$1',[user])
    ]);
    if(!profile) return {profile:null};
    const [ghost,history] = await Promise.all([
      many(`select distinct on (c.id) c.id,w.title,w.author,e.format,ev.created_at as departed_at from passport_events ev join copies c on c.id=ev.copy_id join editions e on e.id=c.edition_id join works w on w.id=e.work_id where ev.event_type='ownership_transferred' and ev.transaction_id in (select id from offers where proposer_id=$1 or recipient_id=$1) and c.owner_id<>$1 and exists(select 1 from offer_items i where i.offer_id=ev.transaction_id and i.copy_id=c.id and i.sender_id=$1) order by c.id,ev.created_at desc`,[user]),
      many(`select l.*,w.title from loans l join copies c on c.id=l.copy_id join editions e on e.id=c.edition_id join works w on w.id=e.work_id where l.borrower_id=$1 and l.return_status='returned'`,[user])
    ]);
    const balances = {available:0,pending:0,held:0,spent:0};
    for(const entry of accountBalances) if(entry.kind in balances) balances[entry.kind as keyof typeof balances]=Number(entry.amount);
    return {profile,copies,wishlist,reads,offers,loans,room,roomHistory,binders,circles,ledger,balances,cases,messages,roles:roles.map((r:{role:string})=>r.role),ghost,history};
  }
  if(scope==='ledger') {
    mine();
    const before=query.get('before');
    if(before) requireValue(/^\d+$/.test(before),'Invalid statement cursor');
    const rows=await many(`select p.id,j.event_key,j.source,j.created_at,a.kind,p.amount from leaflet_postings p join leaflet_accounts a on a.id=p.account_id join leaflet_journals j on j.id=p.journal_id where a.user_id=$1 and ($2::bigint is null or p.id<$2::bigint) order by p.id desc limit 51`,[user,before??null]);
    return {entries:rows.slice(0,50),nextCursor:rows.length>50?String(rows[49].id):null};
  }
  if(scope==='copy') {
    const copyId=query.get('id');requireValue(copyId,'Copy ID required');
    const copy=await one(`select c.*,w.title,w.author,e.isbn,e.format,e.language,e.publisher,l.kind,l.terms,l.acceptable,l.shipping_allowed,l.active,p.handle,p.display_name,p.city,p.visibility as profile_visibility
      from copies c join editions e on e.id=c.edition_id join works w on w.id=e.work_id left join listings l on l.copy_id=c.id join profiles p on p.id=c.owner_id where c.id=$1`,[copyId]);
    requireValue(copy,'Copy not found',404);
    const connected=user?await one('select 1 from offer_items i join offers o on o.id=i.offer_id where i.copy_id=$1 and (o.proposer_id=$2 or o.recipient_id=$2) limit 1',[copyId,user]):null;
    const participant=Boolean(user && (copy.owner_id===user||copy.holder_id===user||connected));
    const visible=copy.audience==='public' && copy.profile_visibility==='public' && copy.active && copy.status==='available';
    requireValue(participant||visible,'Copy is private',403);
    const [events,photos,notes]=await Promise.all([
      many(`select event_type,public_summary,created_at${participant?',detail,actor_id,transaction_id':''} from passport_events where copy_id=$1 ${participant?'':'and public_summary is not null'} order by id desc`,[copyId]),
      many('select id,kind,caption from copy_photos where copy_id=$1 order by created_at',[copyId]),
      many(`select n.id,n.body,n.spoiler,n.created_at,p.handle from journey_notes n join profiles p on p.id=n.author_id where n.copy_id=$1 and n.withdrawn_at is null and (n.audience='public' or n.author_id=$2) order by n.created_at desc`,[copyId,user])
    ]);
    const publicCopy={id:copy.id,condition:copy.condition,condition_notes:copy.condition_notes,special_features:copy.special_features,status:copy.status,owner_id:copy.owner_id,title:copy.title,author:copy.author,isbn:copy.isbn,format:copy.format,language:copy.language,publisher:copy.publisher,kind:copy.kind,terms:copy.terms,acceptable:copy.acceptable,shipping_allowed:copy.shipping_allowed,active:copy.active,handle:copy.handle,display_name:copy.display_name,city:copy.city};
    return {copy:participant?copy:publicCopy,events,photos,notes};
  }
  if(scope==='room') {
    const handle=query.get('handle');requireValue(handle,'Reader handle required');
    const room=await one(`select r.*,p.handle,p.display_name,p.id as owner_id from rooms r join profiles p on p.id=r.user_id where p.handle=$1`,[handle]);
    requireValue(room && (room.owner_id===user || (room.audience==='public' && room.published && await one('select 1 from profiles where id=$1 and visibility=$2',[room.owner_id,'public']))),'Room not found',404);
    const owner=room.owner_id===user;
    const scene=owner ? room.draft : room.published;
    const ids=((scene as {objects?:{copyId?:string}[]})?.objects??[]).map(o=>o.copyId).filter(Boolean);
    const books=ids.length?await many(`select c.id,c.status,c.owner_id,w.title,w.author,c.condition,l.kind,l.active,(select id from copy_photos ph where ph.copy_id=c.id and ph.kind='front' order by created_at limit 1) as front_photo from copies c join editions e on e.id=c.edition_id join works w on w.id=e.work_id left join listings l on l.copy_id=c.id where c.id=any($1::uuid[]) and (c.owner_id=$3 or c.holder_id=$3) and ($2::boolean or (c.audience='public' and c.status='available' and l.active))`,[ids,owner,room.owner_id]):[];
    const allowed=new Set(books.map(b=>String(b.id)));
    const safeScene={...scene,objects:(scene?.objects??[]).filter((o:{copyId?:string})=>!o.copyId||allowed.has(o.copyId))};
    return {room:{id:room.id,name:room.name,mood:room.mood,version:room.version,handle:room.handle,display_name:room.display_name,audience:room.audience},scene:safeScene,books};
  }
  if(scope==='circle') {
    const circleId=query.get('id');requireValue(circleId,'Circle ID required');
    const circle=await one('select * from circles where id=$1',[circleId]);requireValue(circle,'Circle not found',404);
    const member=user?await one('select 1 from circle_members where circle_id=$1 and user_id=$2',[circleId,user]):null;
    requireValue(circle.audience==='public'||member,'Private circle',403);
    const posts=await many(`select cp.id,cp.body,cp.spoiler,cp.created_at,p.handle from circle_posts cp join profiles p on p.id=cp.author_id where cp.circle_id=$1 order by cp.created_at desc limit 100`,[circleId]);
    return {circle,posts,member:Boolean(member)};
  }
  if(scope==='admin') {
    mine();
    const roles=await many<{role:string}>('select role from staff_roles where user_id=$1',[user]);
    const roleSet=new Set(roles.map(r=>r.role));
    requireValue(roles.length,'Staff access required',403);
    const broad=Boolean(roleSet.has('owner')||roleSet.has('security')||roleSet.has('audit'));
    const [cases,policies,auditEvents,counts] = await Promise.all([
      many(broad?'select * from cases order by created_at desc limit 100':'select * from cases where assigned_to=$1 order by created_at desc limit 100',broad?[]:[user]),
      broad?many('select * from policies order by key'):Promise.resolve([]),
      broad?many('select * from audit_events order by id desc limit 100'):Promise.resolve([]),
      broad?one(`select (select count(*)::text from profiles) as readers,(select count(*)::text from copies) as copies,(select count(*)::text from offers where status='disputed') as disputes,(select count(*)::text from loans where return_status <> 'returned') as loans`):Promise.resolve(null)
    ]);
    const term=(query.get('search')??'').trim().slice(0,100);
    let results:Record<string,unknown[]>={};
    if(term&&broad) {
      const like=`%${term}%`;
      const [members,copies,offers,rooms,tags,journals]=await Promise.all([
        many('select id,handle,display_name,visibility from profiles where handle ilike $1 or display_name ilike $1 or id::text=$2 limit 20',[like,term]),
        many(`select c.id,c.status,w.title,p.handle from copies c join editions e on e.id=c.edition_id join works w on w.id=e.work_id join profiles p on p.id=c.owner_id where c.id::text=$2 or w.title ilike $1 limit 20`,[like,term]),
        many('select id,kind,status from offers where id::text=$1 limit 20',[term]),
        many('select id,name,audience from rooms where name ilike $1 or id::text=$2 limit 20',[like,term]),
        many('select id,public_code,status,copy_id from tags where public_code ilike $1 or id::text=$2 limit 20',[like,term]),
        many('select id,event_key,source from leaflet_journals where event_key ilike $1 or id::text=$2 limit 20',[like,term])
      ]);
      results={members,copies,offers,rooms,tags,journals};
    }
    await import('./db').then(({transaction,audit:record})=>transaction(async tx=>record(tx,user,'admin.view','dashboard','overview',{term})));
    return {roles:roles.map(r=>r.role),cases,policies,audit:auditEvents,counts,results};
  }
  throw new DomainError('Unknown view',404);
}
