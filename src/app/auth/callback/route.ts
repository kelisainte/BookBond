import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/auth';
export async function GET(request:NextRequest) {
  const code=request.nextUrl.searchParams.get('code');
  if(code) {const supabase=await supabaseServer();const {error}=await supabase.auth.exchangeCodeForSession(code);if(!error) return NextResponse.redirect(new URL('/',request.url));}
  return NextResponse.redirect(new URL('/login?error=signin',request.url));
}
