import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { currentUser } from '@/lib/auth';
import { command } from '@/lib/commands';
import { DomainError } from '@/lib/validation';
export const runtime='nodejs';
export async function POST(request:NextRequest,context:{params:Promise<{command:string}>}) {
  const requestId=crypto.randomUUID();
  try {
    const user=await currentUser();if(!user) return NextResponse.json({error:'Sign in to continue',requestId},{status:401,headers:{'X-Request-ID':requestId}});
    const {command:action}=await context.params;
    const payload=await request.json();
    if(!payload||typeof payload!=='object'||Array.isArray(payload)) throw new DomainError('Invalid request');
    const result=await command(action,payload,user.id);
    return NextResponse.json({result,requestId},{headers:{'Cache-Control':'no-store','X-Request-ID':requestId}});
  } catch(error) {
    if(error instanceof DomainError) return NextResponse.json({error:error.message,requestId},{status:error.status,headers:{'X-Request-ID':requestId}});
    if(error instanceof ZodError) return NextResponse.json({error:error.issues[0]?.message??'Invalid input',requestId},{status:400,headers:{'X-Request-ID':requestId}});
    console.error('Command failed',{requestId,error:error instanceof Error?error.message:'unknown'});
    return NextResponse.json({error:'Unable to complete this action. Try again.',requestId},{status:500,headers:{'X-Request-ID':requestId}});
  }
}
