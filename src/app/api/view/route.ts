import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { view } from '@/lib/queries';
import { DomainError } from '@/lib/validation';
export const runtime='nodejs';
export async function GET(request:NextRequest) {
  const requestId=crypto.randomUUID();
  try {
    const user=await currentUser();const scope=request.nextUrl.searchParams.get('scope')??'public';
    const result=await view(scope,user?.id??null,request.nextUrl.searchParams);
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store','X-Request-ID':requestId}});
  } catch(error) {
    if(error instanceof DomainError) return NextResponse.json({error:error.message,requestId},{status:error.status,headers:{'X-Request-ID':requestId}});
    console.error('View failed',{requestId,error:error instanceof Error?error.message:'unknown'});
    return NextResponse.json({error:'Unable to load this view',requestId},{status:500,headers:{'X-Request-ID':requestId}});
  }
}
