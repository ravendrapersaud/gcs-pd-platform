import Link from 'next/link'

// The annual "fill out your portfolio" nudge. Shown in a portfolio section's
// empty state — but only to the owner, and only for the current school year —
// so each new year the portfolio re-invites the person to populate it.
export default function PortfolioPromptBlock({
  title,
  blurb,
  cta,
  href,
}: {
  title: string
  blurb?: string
  cta: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/50 hover:bg-navy-50 p-5 text-center transition-colors"
    >
      <p className="text-sm font-medium text-navy-900">{title}</p>
      {blurb && <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{blurb}</p>}
      <span className="inline-block mt-3 btn-primary text-sm">{cta}</span>
    </Link>
  )
}
