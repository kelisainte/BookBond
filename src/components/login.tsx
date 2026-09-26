'use client';
import {useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowLeft,BookOpen} from 'lucide-react';
export function Login({configured}:{configured:boolean}) {
  const [email,setEmail]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function signIn(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage('');
    try {const client=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:`${location.origin}/auth/callback`}});
      setMessage(error?error.message:'Check your inbox for a secure sign-in link.');
    }catch{setMessage('Sign in is not configured yet.')}finally{setBusy(false)}
  }
  return <main className="auth-page"><a href="/" className="back-link"><ArrowLeft size={17}/> Back to BookBonds</a><div className="auth-card"><div className="brandmark"><BookOpen size={25}/></div><p className="eyebrow">WELCOME TO BOOKBONDS</p><h1>Enter your reading life.</h1><p>Save books, find real copies, and make room for the stories that stay with you.</p>
    {configured?<form onSubmit={signIn}><label htmlFor="email">Email address</label><input id="email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><button className="button primary" disabled={busy}>{busy?'Sending…':'Send sign-in link'}</button><p className="form-hint">No password needed. We’ll email a link to this address.</p></form>:<div className="notice">Sign-in will become available when the project is connected to its database and authentication service.</div>}
    {message&&<p role="status" className="notice">{message}</p>}</div></main>
}
