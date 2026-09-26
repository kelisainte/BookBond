import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'BookBonds — Books with a life beyond one shelf',description:'A reading community for real physical copies, thoughtful exchanges and shared reading spaces.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
