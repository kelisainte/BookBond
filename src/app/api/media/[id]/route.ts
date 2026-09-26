import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { storage } from '@/lib/storage';
export const runtime='nodejs';
export async function GET(_request:NextRequest,context:{params:Promise<{id:string}>}) {
  try {
    const {id}=await context.params;const user=await currentUser();
    const photo=await one<{storage_path:string,owner_id:string,holder_id:string,public_view:boolean,participant:boolean}>(`select ph.storage_path,c.owner_id,c.holder_id,
      (c.audience='public' and c.status='available' and l.active=true) as public_view,
      exists(select 1 from offer_items oi join offers o on o.id=oi.offer_id where oi.copy_id=c.id and (o.proposer_id=$2 or o.recipient_id=$2)) as participant
      from copy_photos ph join copies c on c.id=ph.copy_id left join listings l on l.copy_id=c.id where ph.id=$1`,[id,user?.id??null]);
    if(!photo||!(photo.public_view||photo.owner_id===user?.id||photo.holder_id===user?.id||photo.participant)) return NextResponse.json({error:'Not found'},{status:404});
    const {data,error}=await storage().download(photo.storage_path);
    if(error||!data) throw error;
    return new NextResponse(await data.arrayBuffer(),{headers:{'Content-Type':data.type||'image/jpeg','Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
  } catch(error) { console.error('Media download failed',error);return NextResponse.json({error:'Unavailable'},{status:500}); }
}
