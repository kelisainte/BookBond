import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { view } from '@/lib/queries';
import { DomainError } from '@/lib/validation';
export const runtime='nodejs';
export async function GET(request:NextRequest) {
  try {
    const user=await currentUser();const scope=request.nextUrl.searchParams.get('scope')??'public';
    const result=await view(scope,user?.id??null,request.nextUrl.searchParams);
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    if(error instanceof DomainError) return NextResponse.json({error:error.message},{status:error.status});
    console.error('View failed',error);return NextResponse.json({error:'Unable to load this view'},{status:500});
  }
}
