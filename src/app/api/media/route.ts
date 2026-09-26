import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { transaction, audit } from '@/lib/db';
import { storage } from '@/lib/storage';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
  const user=await currentUser();if(!user) return NextResponse.json({error:'Sign in to continue'},{status:401});
  try {
    const form=await request.formData();const copyId=String(form.get('copyId')??'');
    const kind=String(form.get('kind')??'front');const file=form.get('file');
    if(!['front','back','spine','flaw','feature'].includes(kind)||!(file instanceof File)||file.size>8*1024*1024||file.size<100)
      return NextResponse.json({error:'Use an image under 8 MB'},{status:400});
    const buffer=Buffer.from(await file.arrayBuffer());
    const mime=buffer.subarray(0,3).toString('hex')==='ffd8ff'?'image/jpeg':buffer.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'image/png':buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'?'image/webp':null;
    if(!mime) return NextResponse.json({error:'JPEG, PNG or WebP images only'},{status:400});
    const permitted=await transaction(async tx=>{
      const {rows}=await tx.query('select id from copies where id=$1 and owner_id=$2 and reserved_by is null for update',[copyId,user.id]);
      return Boolean(rows[0]);
    });
    if(!permitted) return NextResponse.json({error:'Copy unavailable for photo changes'},{status:403});
    const path=`${user.id}/${copyId}/${crypto.randomUUID()}.${mime.split('/')[1]}`;
    const {error}=await storage().upload(path,buffer,{contentType:mime,upsert:false});
    if(error) throw error;
    try {
      const result=await transaction(async tx=>{
        const {rows}=await tx.query('select id from copies where id=$1 and owner_id=$2 and reserved_by is null for update',[copyId,user.id]);
        if(!rows[0]) throw new Error('Copy changed during upload');
        const {rows:photos}=await tx.query('insert into copy_photos(copy_id,storage_path,kind) values($1,$2,$3) returning id',[copyId,path,kind]);
        await audit(tx,user.id,'photo.add','copy',copyId,{photoId:photos[0].id,kind});return photos[0];
      });
      return NextResponse.json(result);
    } catch(e) { await storage().remove([path]);throw e; }
  } catch(error) { console.error('Media upload failed',error);return NextResponse.json({error:'Unable to upload image'},{status:500}); }
}
