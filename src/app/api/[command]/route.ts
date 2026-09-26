import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { currentUser } from '@/lib/auth';
import { command } from '@/lib/commands';
import { DomainError } from '@/lib/validation';
export const runtime='nodejs';
export async function POST(request:NextRequest,context:{params:Promise<{command:string}>}) {
  try {
    const user=await currentUser();if(!user) return NextResponse.json({error:'Sign in to continue'},{status:401});
    const {command:action}=await context.params;
    const payload=await request.json();
    if(!payload||typeof payload!=='object'||Array.isArray(payload)) throw new DomainError('Invalid request');
    const result=await command(action,payload,user.id);
    return NextResponse.json({result,requestId:crypto.randomUUID()},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if(error instanceof DomainError) return NextResponse.json({error:error.message},{status:error.status});
    if(error instanceof ZodError) return NextResponse.json({error:error.issues[0]?.message??'Invalid input'},{status:400});
    console.error('Command failed',error);return NextResponse.json({error:'Unable to complete this action. Try again.'},{status:500});
  }
}
