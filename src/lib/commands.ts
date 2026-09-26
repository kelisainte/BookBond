import { transaction, audit, type Tx } from './db';
import { DomainError, requireValue, short, note, uuid } from './validation';
import { postBalanced } from './ledger';
import { z } from 'zod';
import { offerKindForListing, type ListingKind } from './offer-kind';
import {effectivePolicy,validatePolicy, type PolicyKey} from './policies';

type Body = Record<string, unknown>;
const text = (value:unknown) => short.parse(value);
const details = (value:unknown) => note.parse(value ?? '');
const id = (value:unknown) => uuid.parse(value);
const bool = (value:unknown) => Boolean(value);
const enumValue = <T extends string>(value:unknown, choices:readonly T[]):T => {
  requireValue(typeof value === 'string' && choices.includes(value as T), `Choose ${choices.join(', ')}`);
  return value as T;
};
const ensureProfile = async(tx:Tx,user:string) => {
  const {rows} = await tx.query('select id from profiles where id=$1',[user]);
  requireValue(rows.length,'Finish setting up your profile first',403);
};
const lockOffer = async(tx:Tx,offerId:string,user:string) => {
  const {rows} = await tx.query('select * from offers where id=$1 for update',[offerId]);
  const offer = rows[0]; requireValue(offer,'Offer not found',404);
  requireValue([offer.proposer_id,offer.recipient_id].includes(user),'Not a participant',403);
  return offer;
};
const assertOpen = (offer:Record<string,unknown>) => requireValue(!['settled','cancelled'].includes(String(offer.status)),'This agreement is already closed',409);

export async function command(action:string, payload:Body, user:string) {
  return transaction(async tx => {
    if (action === 'profile.create') {
      const handle = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/).parse(payload.handle);
      const name = text(payload.displayName);
      await tx.query('insert into profiles(id,handle,display_name) values($1,$2,$3) on conflict(id) do nothing',[user,handle,name]);
      await tx.query('insert into rooms(user_id) values($1) on conflict(user_id) do nothing',[user]);
      await audit(tx,user,action,'profile',user); return {id:user};
    }
    await ensureProfile(tx,user);
    if (action === 'profile.update') {
      const fields = {
        display_name: text(payload.displayName), bio: details(payload.bio), city: String(payload.city ?? '').slice(0,120),
        visibility: enumValue(payload.visibility,['public','private'] as const),
        shipping_enabled: bool(payload.shippingEnabled), discovery_radius: z.coerce.number().int().min(1).max(500).parse(payload.discoveryRadius),
        reduced_motion: bool(payload.reducedMotion), sound_enabled: bool(payload.soundEnabled),
        profile_theme: enumValue(payload.profileTheme,['paper','ink'] as const)
      };
      const {rows} = await tx.query('update profiles set display_name=$2,bio=$3,city=$4,visibility=$5,shipping_enabled=$6,discovery_radius=$7,reduced_motion=$8,sound_enabled=$9,profile_theme=$10,updated_at=now() where id=$1 returning *',
        [user,...Object.values(fields)]);
      await audit(tx,user,action,'profile',user,{fields:Object.keys(fields)});return rows[0];
    }
    if (action === 'wishlist.add') {
      const {rows} = await tx.query('insert into wishlists(user_id,title,author,edition_note) values($1,$2,$3,$4) returning *',[user,text(payload.title),String(payload.author??'').slice(0,180),String(payload.editionNote??'').slice(0,180)]);
      return rows[0];
    }
    if (action === 'wishlist.remove') {
      await tx.query('delete from wishlists where id=$1 and user_id=$2',[id(payload.id),user]); return {removed:true};
    }
    if (action === 'reading.save') {
      const status=enumValue(payload.status,['want','reading','finished','paused','dnf'] as const);
      const rowId=payload.id ? id(payload.id) : null;
      const progress=payload.progress === '' || payload.progress == null ? null : z.coerce.number().int().min(0).max(100).parse(payload.progress);
      const {rows}=await tx.query(`insert into reading_entries(id,user_id,title,author,status,progress,note,audience,finished_at)
        values(coalesce($1,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,case when $5='finished' then now() else null end)
        on conflict(id) do update set title=excluded.title,author=excluded.author,status=excluded.status,progress=excluded.progress,note=excluded.note,audience=excluded.audience,finished_at=case when excluded.status='finished' then coalesce(reading_entries.finished_at,now()) else null end,updated_at=now()
        where reading_entries.user_id=$2 returning *`,[rowId,user,text(payload.title),String(payload.author??'').slice(0,180),status,progress,details(payload.note),enumValue(payload.audience??'private',['private','public'] as const)]);
      requireValue(rows[0],'Reading entry not found',404);return rows[0];
    }
    if (action === 'copy.create') {
      const title=text(payload.title), author=text(payload.author), condition=enumValue(payload.condition,['New','Like new','Good','Fair','Poor'] as const);
      let workId:string, editionId:string;
      const isbn=String(payload.isbn??'').replace(/[-\s]/g,'').slice(0,20)||null;
      if (isbn) {
        const {rows}=await tx.query('select e.id as edition_id,e.work_id from editions e where e.isbn=$1 order by e.created_at limit 1',[isbn]);
        if(rows[0]) { editionId=rows[0].edition_id;workId=rows[0].work_id; }
        else { ({rows:[{id:workId}]}=await tx.query('insert into works(title,author) values($1,$2) returning id',[title,author]));({rows:[{id:editionId}]}=await tx.query('insert into editions(work_id,isbn,format,language) values($1,$2,$3,$4) returning id',[workId,isbn,String(payload.format??'Paperback').slice(0,80),String(payload.language??'English').slice(0,80)])); }
      } else { ({rows:[{id:workId}]}=await tx.query('insert into works(title,author) values($1,$2) returning id',[title,author]));({rows:[{id:editionId}]}=await tx.query('insert into editions(work_id,format,language) values($1,$2,$3) returning id',[workId,String(payload.format??'Paperback').slice(0,80),String(payload.language??'English').slice(0,80)])); }
      const {rows}=await tx.query('insert into copies(edition_id,owner_id,holder_id,condition,condition_notes,special_features,audience) values($1,$2,$2,$3,$4,$5,$6) returning *',
        [editionId,user,condition,details(payload.conditionNotes),details(payload.specialFeatures),enumValue(payload.audience??'private',['public','private'] as const)]);
      await tx.query('insert into passport_events(copy_id,event_type,actor_id,public_summary) values($1,$2,$3,$4)',[rows[0].id,'registered',user,'Copy registered']);
      await audit(tx,user,action,'copy',rows[0].id);return rows[0];
    }
    if (action === 'listing.save') {
      requireValue((await effectivePolicy(tx,'feature_flags')).listingsEnabled,'New listing changes are temporarily paused',409);
      const copyId=id(payload.copyId);
      const {rows:[copy]}=await tx.query('select * from copies where id=$1 for update',[copyId]);
      requireValue(copy && copy.owner_id===user && copy.holder_id===user,'Only the owner holding this copy can list it',403);
      requireValue(!copy.reserved_by && !['on_loan','in_transit','under_review'].includes(copy.status),'Copy is committed or unavailable',409);
      const kind=enumValue(payload.kind,['swap','loan','gift'] as const), active=bool(payload.active);
      if(active) { const {rows:photos}=await tx.query("select kind from copy_photos where copy_id=$1",[copyId]);
        requireValue(['front','back','spine'].every(kind=>photos.some(p=>p.kind===kind)),'Upload actual front, back and spine photos before publishing'); }
      const {rows}=await tx.query(`insert into listings(copy_id,kind,terms,acceptable,due_days,shipping_allowed,active)
        values($1,$2,$3,$4,$5,$6,$7) on conflict(copy_id) do update set kind=excluded.kind,terms=excluded.terms,acceptable=excluded.acceptable,due_days=excluded.due_days,shipping_allowed=excluded.shipping_allowed,active=excluded.active,revision=listings.revision+1,updated_at=now() returning *`,
        [copyId,kind,details(payload.terms),details(payload.acceptable),kind==='loan' && payload.dueDays ? z.coerce.number().int().positive().max(365).parse(payload.dueDays) : null,bool(payload.shippingAllowed),active]);
      await tx.query('update copies set status=$2,audience=$3,version=version+1,updated_at=now() where id=$1',[copyId,active?'available':'unlisted',active?'public':'private']);
      await tx.query('insert into passport_events(copy_id,event_type,actor_id,public_summary) values($1,$2,$3,$4)',[copyId,active?'listed':'unlisted',user,active?'Copy listed':null]);
      return rows[0];
    }
    if (action === 'offer.create') {
      requireValue((await effectivePolicy(tx,'feature_flags')).offersEnabled,'New offers are temporarily paused',409);
      const recipient=id(payload.recipientId), requestedKind=enumValue(payload.kind,['swap','bond','loan','gift'] as const);
      const kind=requestedKind==='bond'?'bond':offerKindForListing(requestedKind as ListingKind);
      requireValue(recipient!==user,'Choose another reader');
      const copyIds=z.array(uuid).min(1).max(8).parse(payload.copyIds);
      requireValue(new Set(copyIds).size===copyIds.length,'A copy can appear only once');
      const method=enumValue(payload.method??'meetup',['meetup','shipping'] as const);
      requireValue(method==='meetup','Mailed handoffs are not available until a shipping provider and policy are configured');
      const {rows:blocked}=await tx.query('select 1 from blocks where (blocker_id=$1 and blocked_id=$2) or (blocker_id=$2 and blocked_id=$1)',[user,recipient]);
      requireValue(!blocked.length,'Offer unavailable',403);
      const {rows:copies}=await tx.query(`select c.*,l.kind,l.terms,l.acceptable,l.shipping_allowed,l.active,l.due_days,l.revision,w.title,w.author,e.format
        from copies c join listings l on l.copy_id=c.id join editions e on e.id=c.edition_id join works w on w.id=e.work_id
        where c.id=any($1::uuid[]) order by c.id for update of c`,[copyIds]);
      requireValue(copies.length===copyIds.length,'A listed copy could not be found',404);
      requireValue(copies.every(c=>c.active && c.status==='available' && !c.reserved_by),'A copy is no longer available',409);
      for(const copy of copies) { const {rows:photos}=await tx.query('select kind from copy_photos where copy_id=$1',[copy.id]);
        requireValue(['front','back','spine'].every(kind=>photos.some(p=>p.kind===kind)),'A listed copy is missing required actual photos',409); }
      requireValue(copies.every(c=>[user,recipient].includes(c.owner_id)),'Offer contains another reader’s copy',403);
      requireValue(copies.some(c=>c.owner_id===recipient),'Include a copy from the recipient');
      requireValue(kind!=='bond' || copies.some(c=>c.owner_id===user),'A Bond needs a copy from each reader');
      requireValue(kind==='bond' || copies.length===1,'A loan or gift has one copy');
      requireValue(kind==='bond' ? copies.every(c=>c.kind==='swap') : copies[0].kind===kind,'The listing does not allow this handoff');
      const evidence=[];
      for(const copy of copies) { const {rows:photos}=await tx.query('select storage_path,kind,caption from copy_photos where copy_id=$1 order by storage_path',[copy.id]);
        evidence.push({id:copy.id,version:copy.version,listingRevision:copy.revision,title:copy.title,author:copy.author,condition:copy.condition,conditionNotes:copy.condition_notes,features:copy.special_features,listingTerms:copy.terms,photos}); }
      const proposed={version:1,kind,method,terms:details(payload.terms),platformCost:0,dueAt:kind==='loan'?new Date(Date.now()+Number(copies[0].due_days??30)*86400000).toISOString():null,copies:evidence};
      const {rows:offerRows}=await tx.query('insert into offers(kind,proposer_id,recipient_id,method,terms,snapshot) values($1,$2,$3,$4,$5,$6) returning *',[kind,user,recipient,method,details(payload.terms),JSON.stringify(proposed)]);
      const offer=offerRows[0];
      for (const c of copies) await tx.query('insert into offer_items(offer_id,copy_id,sender_id,recipient_id) values($1,$2,$3,$4)',[offer.id,c.id,c.owner_id,c.owner_id===user?recipient:user]);
      await tx.query('insert into offer_acceptances(offer_id,user_id,version) values($1,$2,$3)',[offer.id,user,offer.version]);
      await audit(tx,user,action,'offer',offer.id,{kind,copyIds});return offer;
    }
    if (action === 'offer.accept') {
      const offer=await lockOffer(tx,id(payload.offerId),user);
      requireValue(offer.status==='offered','This offer cannot be accepted',409);
      const {rows:items}=await tx.query('select * from offer_items where offer_id=$1 order by copy_id',[offer.id]);
      const {rows:copies}=await tx.query('select * from copies where id=any($1::uuid[]) order by id for update',[items.map(i=>i.copy_id)]);
      requireValue(copies.every(c=>c.status==='available' && !c.reserved_by),'A copy was committed elsewhere. Revise or cancel the offer.',409);
      await tx.query('insert into offer_acceptances(offer_id,user_id,version) values($1,$2,$3) on conflict(offer_id,user_id) do update set version=excluded.version,accepted_at=now()',[offer.id,user,offer.version]);
      const {rows:acceptances}=await tx.query('select * from offer_acceptances where offer_id=$1 and version=$2',[offer.id,offer.version]);
      if (acceptances.length<2) return {status:'awaiting_other_reader'};
      const proposed=offer.snapshot;
      requireValue(proposed?.version===offer.version && proposed?.copies?.length===copies.length,'Offer version is unavailable',409);
      for(const copy of copies) {
        const saved=proposed.copies.find((item:{id:string})=>item.id===copy.id);
        const {rows:live}=await tx.query('select revision from listings where copy_id=$1',[copy.id]);
        const {rows:photos}=await tx.query('select storage_path,kind,caption from copy_photos where copy_id=$1 order by storage_path',[copy.id]);
        requireValue(saved && saved.version===copy.version && saved.listingRevision===live[0]?.revision && JSON.stringify(saved.photos)===JSON.stringify(photos),'A copy changed since this offer was proposed. Make a new offer.',409);
      }
      const snapshot={...proposed,acceptedAt:new Date().toISOString()};
      await tx.query('update offers set status=$2,snapshot=$3,updated_at=now() where id=$1',[offer.id,'reserved',JSON.stringify(snapshot)]);
      for(const item of items) {
        await tx.query('update copies set status=$2,reserved_by=$3,version=version+1 where id=$1',[item.copy_id,'reserved',offer.id]);
        await tx.query('insert into delivery_legs(offer_id,copy_id,sender_id,recipient_id) values($1,$2,$3,$4)',[offer.id,item.copy_id,item.sender_id,item.recipient_id]);
        await tx.query('insert into passport_events(copy_id,event_type,actor_id,transaction_id,public_summary) values($1,$2,$3,$4,$5)',[item.copy_id,'reserved',user,offer.id,null]);
      }
      await audit(tx,user,action,'offer',offer.id,{version:offer.version});return {status:'reserved'};
    }
    if (action === 'offer.cancel') {
      const offer=await lockOffer(tx,id(payload.offerId),user);assertOpen(offer);
      requireValue(['offered','reserved'].includes(offer.status),'A dispatched agreement needs case review',409);
      await tx.query('update offers set status=$2,updated_at=now() where id=$1',[offer.id,'cancelled']);
      const {rows:reserved}=await tx.query('update copies set status=$2,reserved_by=null where reserved_by=$1 returning id',[offer.id,'available']);
      for(const copy of reserved) await tx.query('insert into passport_events(copy_id,event_type,actor_id,transaction_id) values($1,$2,$3,$4)',[copy.id,'reservation_cancelled',user,offer.id]);
      await audit(tx,user,action,'offer',offer.id,{},details(payload.reason));return {status:'cancelled'};
    }
    if (action === 'offer.dispatch') {
      const offer=await lockOffer(tx,id(payload.offerId),user);requireValue(['reserved','preparing','dispatched'].includes(offer.status),'Agreement is not ready for handoff',409);
      const legId=id(payload.legId);
      const {rows}=await tx.query('update delivery_legs set status=$3,tracking_reference=$4,dispatched_at=now() where id=$1 and sender_id=$2 and status=$5 returning *',[legId,user,'dispatched',String(payload.tracking??'').slice(0,120)||null,'preparing']);
      requireValue(rows[0],'Only the sender may mark an undelivered leg dispatched',403);
      await tx.query('update offers set status=$2,updated_at=now() where id=$1',[offer.id,'dispatched']);
      await tx.query('update copies set status=$2 where id=$1',[rows[0].copy_id,'in_transit']);
      await tx.query('insert into passport_events(copy_id,event_type,actor_id,transaction_id) values($1,$2,$3,$4)',[rows[0].copy_id,'dispatched',user,offer.id]);
      return rows[0];
    }
    if (action === 'offer.receive') {
      const offer=await lockOffer(tx,id(payload.offerId),user);requireValue(offer.status==='dispatched','No receipt is ready to confirm',409);
      const {rows}=await tx.query('update delivery_legs set status=$3,confirmed_at=now() where id=$1 and recipient_id=$2 and status=$4 returning *',[id(payload.legId),user,'received','dispatched']);
      requireValue(rows[0],'Only the recipient can confirm a dispatched copy once',403);
      await tx.query('insert into passport_events(copy_id,event_type,actor_id,transaction_id) values($1,$2,$3,$4)',[rows[0].copy_id,'receipt_confirmed',user,offer.id]);
      const {rows:remaining}=await tx.query("select id from delivery_legs where offer_id=$1 and status <> 'received'",[offer.id]);
      if(remaining.length) return {status:'awaiting_other_legs'};
      const {rows:legs}=await tx.query('select * from delivery_legs where offer_id=$1',[offer.id]);
      for(const leg of legs) {
        if(offer.kind==='loan') {
          await tx.query('update copies set holder_id=$2,status=$3,reserved_by=null,version=version+1,updated_at=now() where id=$1',[leg.copy_id,leg.recipient_id,'on_loan']);
          await tx.query('insert into loans(offer_id,copy_id,owner_id,borrower_id,due_at) values($1,$2,$3,$4,$5)',[offer.id,leg.copy_id,leg.sender_id,leg.recipient_id,offer.snapshot?.dueAt??null]);
          await tx.query('insert into passport_events(copy_id,event_type,actor_id,transaction_id,public_summary) values($1,$2,$3,$4,$5)',[leg.copy_id,'loan_started',user,offer.id,'Loan handoff confirmed']);
        } else {
          await tx.query('update copies set owner_id=$2,holder_id=$2,status=$3,reserved_by=null,version=version+1,updated_at=now() where id=$1',[leg.copy_id,leg.recipient_id,'unlisted']);
          await tx.query('update listings set active=false where copy_id=$1',[leg.copy_id]);
          await tx.query('insert into passport_events(copy_id,event_type,actor_id,transaction_id,public_summary) values($1,$2,$3,$4,$5)',[leg.copy_id,'ownership_transferred',user,offer.id,'Handoff confirmed']);
        }
      }
      await tx.query('update offers set status=$2,updated_at=now() where id=$1',[offer.id,'settled']);
      if(offer.kind==='bond') for(const participant of [offer.proposer_id,offer.recipient_id]) {
        await postBalanced(tx,`bond:${offer.id}:${participant}`,'bond_settlement',[
          {userId:null,kind:'issuance',amount:-10},{userId:participant,kind:'available',amount:10}],participant);
      }
      await audit(tx,user,'offer.settle','offer',offer.id,{kind:offer.kind});return {status:'settled'};
    }
    if (action === 'loan.return') {
      const {rows:[loan]}=await tx.query('select * from loans where id=$1 for update',[id(payload.loanId)]);
      requireValue(loan && [loan.owner_id,loan.borrower_id].includes(user),'Loan not found',404);
      if(user===loan.borrower_id) {
        requireValue(['active','requested'].includes(loan.return_status),'Return already in progress',409);
        await tx.query("update loans set return_status='dispatched' where id=$1",[loan.id]);return {status:'dispatched'};
      }
      requireValue(loan.return_status==='dispatched','Borrower has not marked the return',409);
      await tx.query("update loans set return_status='returned',returned_at=now() where id=$1",[loan.id]);
      await tx.query("update copies set holder_id=$2,status='unlisted',version=version+1 where id=$1",[loan.copy_id,loan.owner_id]);
      await tx.query('insert into passport_events(copy_id,event_type,actor_id,transaction_id,public_summary) values($1,$2,$3,$4,$5)',[loan.copy_id,'loan_returned',user,loan.offer_id,'Loan returned']);
      return {status:'returned'};
    }
    if (action === 'case.create') {
      const offerId=payload.offerId ? id(payload.offerId):null, copyId=payload.copyId ? id(payload.copyId):null;
      if(offerId) {
        const offer=await lockOffer(tx,offerId,user);assertOpen(offer);
        await tx.query("update offers set status='disputed' where id=$1",[offerId]);
      }
      if(copyId && !offerId) {
        const {rows}=await tx.query('select id from copies where id=$1 and (owner_id=$2 or holder_id=$2)',[copyId,user]);
        requireValue(rows.length,'Copy not available for a case',403);
      }
      const {rows}=await tx.query('insert into cases(reporter_id,offer_id,copy_id,kind,details) values($1,$2,$3,$4,$5) returning *',[user,offerId,copyId,text(payload.kind),details(payload.details)]);
      await audit(tx,user,action,'case',rows[0].id);return rows[0];
    }
    if (action === 'room.save' || action === 'room.publish') {
      const {rows:[room]}=await tx.query('select * from rooms where user_id=$1 for update',[user]);requireValue(room,'Room not found',404);
      if(action==='room.save') {
        const baseVersion=z.number().int().min(0).parse(payload.baseVersion);
        requireValue(room.draft_version===baseVersion,'Room changed in another tab. Your unsaved draft is still here; export it before reloading.',409);
        const scene=z.object({light:z.number().min(0).max(100),objects:z.array(z.object({id:z.string().max(80),type:z.enum(['shelf','chair','plant','lamp','art','book']),x:z.number().min(0).max(100),y:z.number().min(0).max(100),rotation:z.number().min(-180).max(180),scale:z.number().min(0.5).max(2).optional(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),copyId:z.uuid().optional()})).max(80)}).parse(payload.scene);
        const copyIds=scene.objects.filter(o=>o.copyId).map(o=>o.copyId);
        if(copyIds.length) {
          const {rows:allowed}=await tx.query('select id from copies where id=any($1::uuid[]) and (owner_id=$2 or holder_id=$2)',[copyIds,user]);
          requireValue(allowed.length===new Set(copyIds).size,'A Room book must be yours or borrowed by you',403);
        }
        const {rows}=await tx.query('update rooms set draft=$2,name=$3,mood=$4,draft_version=draft_version+1,updated_at=now() where user_id=$1 returning draft_version',[user,JSON.stringify(scene),text(payload.name),enumValue(payload.mood,['study','sunroom','archive','afterhours'] as const)]);
        await tx.query('insert into room_draft_versions(room_id,version,scene,name,mood) values($1,$2,$3,$4,$5)',[room.id,rows[0].draft_version,JSON.stringify(scene),text(payload.name),enumValue(payload.mood,['study','sunroom','archive','afterhours'] as const)]);
        return {saved:true,draftVersion:rows[0].draft_version};
      }
      requireValue((await effectivePolicy(tx,'feature_flags')).roomPublishingEnabled,'Room publishing is temporarily paused',409);
      requireValue(room.draft_version===z.number().int().min(0).parse(payload.baseVersion),'Room changed before publication. Review the latest draft.',409);
      const audience=enumValue(payload.audience,['public','private'] as const);
      const {rows}=await tx.query('update rooms set published=draft,audience=$2,version=version+1,updated_at=now() where user_id=$1 returning *',[user,audience]);
      await tx.query('insert into room_versions(room_id,version,scene) values($1,$2,$3)',[room.id,rows[0].version,JSON.stringify(room.draft)]);
      await audit(tx,user,action,'room',room.id,{version:rows[0].version,audience});return {version:rows[0].version};
    }
    if(action==='room.restore') {
      const baseVersion=z.number().int().min(0).parse(payload.baseVersion);
      const version=z.number().int().positive().parse(payload.version);
      const {rows:[room]}=await tx.query('select * from rooms where user_id=$1 for update',[user]);
      requireValue(room,'Room not found',404);
      requireValue(room.draft_version===baseVersion,'Room changed in another tab. Reload before restoring.',409);
      const {rows:[saved]}=await tx.query('select scene,name,mood from room_draft_versions where room_id=$1 and version=$2',[room.id,version]);
      requireValue(saved,'Draft revision not found',404);
      const nextVersion=room.draft_version+1;
      await tx.query('update rooms set draft=$2,name=$3,mood=$4,draft_version=$5,updated_at=now() where id=$1',[room.id,saved.scene,saved.name,saved.mood,nextVersion]);
      await tx.query('insert into room_draft_versions(room_id,version,scene,name,mood) values($1,$2,$3,$4,$5)',[room.id,nextVersion,saved.scene,saved.name,saved.mood]);
      await audit(tx,user,action,'room',room.id,{fromVersion:version,toVersion:nextVersion});
      return {draftVersion:nextVersion,scene:saved.scene,name:saved.name,mood:saved.mood};
    }
    if(action==='binder.create') {
      const {rows}=await tx.query('insert into binders(user_id,name,audience) values($1,$2,$3) returning *',[user,text(payload.name),enumValue(payload.audience??'private',['private','public'] as const)]);return rows[0];
    }
    if(action==='binder.add') {
      const binderId=id(payload.binderId),copyId=id(payload.copyId);
      const {rows}=await tx.query('select 1 from binders b join copies c on c.id=$2 where b.id=$1 and b.user_id=$3 and (c.owner_id=$3 or c.holder_id=$3)',[binderId,copyId,user]);
      requireValue(rows.length,'Book or binder unavailable',403);
      await tx.query('insert into binder_copies(binder_id,copy_id) values($1,$2) on conflict do nothing',[binderId,copyId]);return {added:true};
    }
    if(action==='circle.create') {
      const {rows}=await tx.query('insert into circles(host_id,name,description,current_title) values($1,$2,$3,$4) returning *',[user,text(payload.name),details(payload.description),payload.currentTitle?text(payload.currentTitle):null]);
      await tx.query('insert into circle_members(circle_id,user_id) values($1,$2)',[rows[0].id,user]);return rows[0];
    }
    if(action==='circle.join') {
      const circleId=id(payload.circleId);
      const {rows}=await tx.query("select id from circles where id=$1 and audience='public'",[circleId]);requireValue(rows.length,'Circle unavailable',404);
      await tx.query('insert into circle_members(circle_id,user_id) values($1,$2) on conflict do nothing',[circleId,user]);return {joined:true};
    }
    if(action==='circle.post') {
      const circleId=id(payload.circleId);
      const {rows:member}=await tx.query('select 1 from circle_members where circle_id=$1 and user_id=$2',[circleId,user]);requireValue(member.length,'Join the circle to post',403);
      const {rows}=await tx.query('insert into circle_posts(circle_id,author_id,body,spoiler) values($1,$2,$3,$4) returning *',[circleId,user,text(payload.body),bool(payload.spoiler)]);return rows[0];
    }
    if(action==='message.send') {
      const recipient=id(payload.recipientId);requireValue(recipient!==user,'Choose another reader');
      const {rows:blocked}=await tx.query('select 1 from blocks where (blocker_id=$1 and blocked_id=$2) or (blocker_id=$2 and blocked_id=$1)',[user,recipient]);requireValue(!blocked.length,'Message unavailable',403);
      const {rows}=await tx.query('insert into messages(sender_id,recipient_id,body) values($1,$2,$3) returning *',[user,recipient,details(payload.body)]);return rows[0];
    }
    if(action==='block.add') {
      const target=id(payload.userId);requireValue(target!==user,'Cannot block yourself');
      await tx.query('insert into blocks(blocker_id,blocked_id) values($1,$2) on conflict do nothing',[user,target]);return {blocked:true};
    }
    if(action==='note.add') {
      const copyId=id(payload.copyId);
      const {rows:held}=await tx.query('select 1 from passport_events where copy_id=$1 and (actor_id=$2 or detail->>\'from\'=$2) limit 1',[copyId,user]);
      const {rows:current}=await tx.query('select 1 from copies where id=$1 and (owner_id=$2 or holder_id=$2)',[copyId,user]);
      requireValue(held.length||current.length,'Only a reader connected to this copy can leave a note',403);
      const {rows}=await tx.query('insert into journey_notes(copy_id,author_id,body,spoiler,audience) values($1,$2,$3,$4,$5) returning *',[copyId,user,details(payload.body),bool(payload.spoiler),enumValue(payload.audience??'private',['private','public'] as const)]);return rows[0];
    }
    if(action==='note.withdraw') {
      await tx.query('update journey_notes set withdrawn_at=now() where id=$1 and author_id=$2',[id(payload.noteId),user]);return {withdrawn:true};
    }
    if(action==='admin.policy' || action==='admin.case') {
      const {rows:roles}=await tx.query('select role from staff_roles where user_id=$1',[user]);
      const roleSet=new Set(roles.map(r=>r.role));
      if(action==='admin.policy') {
        requireValue(roleSet.has('owner')||roleSet.has('security'),'Insufficient role',403);
        const key=z.enum(['feature_flags','discovery','service_notices']).parse(payload.key) as PolicyKey;
        requireValue(details(payload.reason).length>=10,'Explain the reason for this change');
        const value=validatePolicy(key,payload.value);
        const {rows}=await tx.query('insert into policies(key,value,updated_by) values($1,$2,$3) on conflict(key) do update set value=excluded.value,version=policies.version+1,updated_by=excluded.updated_by,updated_at=now() returning *',[key,JSON.stringify(value),user]);
        await audit(tx,user,action,'policy',key,{version:rows[0].version},details(payload.reason));return rows[0];
      }
      requireValue(roleSet.has('owner')||roleSet.has('trust')||roleSet.has('support'),'Insufficient role',403);
      if(!roleSet.has('owner')&&!roleSet.has('trust')) { const {rows:assigned}=await tx.query('select 1 from cases where id=$1 and assigned_to=$2',[id(payload.caseId),user]);requireValue(assigned.length,'Case is not assigned to you',403); }
      const status=enumValue(payload.status,['review','resolved','appealed'] as const);
      const {rows}=await tx.query('update cases set status=$2,resolution=$3,updated_at=now() where id=$1 returning *',[id(payload.caseId),status,details(payload.resolution)]);
      requireValue(rows[0],'Case not found',404);
      await audit(tx,user,action,'case',rows[0].id,{status},details(payload.reason));return rows[0];
    }
    throw new DomainError('Unknown command',404);
  });
}
