import { Login } from '@/components/login';
import { authConfigured } from '@/lib/auth';
export default function LoginPage(){return <Login configured={authConfigured()}/>}
