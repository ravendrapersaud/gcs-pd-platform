import { redirect } from 'next/navigation'

// School Goals moved into the Goals Dashboard as a tab. Keep this route so old
// links/bookmarks still work.
export default function GoalsDirectoryRedirect() {
  redirect('/dashboard/goals?tab=school')
}
