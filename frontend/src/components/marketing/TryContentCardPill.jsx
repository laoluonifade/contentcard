import { Link } from 'react-router-dom'

/**
 * Top-right "Try ContentCard" pill, modelled on ChatGPT's "Try ChatGPT".
 * Drops a visitor straight into the app — / redirects them through to the
 * dashboard the same way ChatGPT's overview page does.
 *
 * Single small visual element so it stays consistent everywhere it lands.
 */
export default function TryContentCardPill({
  className = '',
  label = 'Try ContentCard',
  size = 'md',
  to = '/signup',
}) {
  const sizeCls =
    size === 'sm'
      ? 'px-4 py-2 text-xs'
      : size === 'lg'
        ? 'px-6 py-3 text-sm'
        : 'px-5 py-2.5 text-sm'
  return (
    <Link
      to={to}
      data-cta="try-contentcard"
      className={`inline-flex items-center justify-center rounded-full bg-ink hover:bg-ink/90 text-white font-semibold transition-colors ${sizeCls} ${className}`}
    >
      {label}
    </Link>
  )
}
