import { redirect } from 'next/navigation'

// Root redirects are handled by middleware, but this is a fallback
export default function RootPage() {
  redirect('/login')
}
