/**
 * Official Shopify bag-mark logo.
 * Three-layer structure matching Shopify's brand guidelines:
 *   1. Light-green bag body (#95BF47)
 *   2. Dark-green right shadow panel (#5E8E3E)
 *   3. White "S" letterform
 * monochrome=true renders all paths white (for use on coloured backgrounds).
 */
export default function ShopifyIcon({ className = 'h-5 w-5', monochrome = false }) {
  const bag    = monochrome ? '#FFFFFF' : '#95BF47'
  const shadow = monochrome ? '#FFFFFF' : '#5E8E3E'
  const letter = '#FFFFFF'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 109.5 124.5"
      className={className}
      aria-hidden="true"
      role="img"
    >
      {/* Bag body */}
      <path
        fill={bag}
        d="M74.7 14.8s-1.4.4-3.7 1.1c-.4-1.3-1-2.9-1.8-4.6C66.5 6.1 62.5 3.4 57.8 3.4c-.3 0-.6 0-1 .1-.1-.2-.3-.3-.5-.5-2.2-2.4-5-3.5-8.5-3.4-6.6.2-13.2 5-18.5 13.5-3.8 6-6.6 13.5-7.4 19.3-7.6 2.4-12.9 4-13 4.1-.4.1-.4.1-.4.5-.1.3-4.1 52.9-4.1 52.9L59.1 124l33.3-8.1S74.7 15.3 74.7 14.8zM57.1 7.1c.2 0 .4.1.7.1 1.8 3.2 2.8 7.6 3.1 11.4l-9.9 3.1c1-4.9 3.7-9.7 6.1-11.8V7.1zM48 6.3c.6-.2 1.2-.4 1.9-.5-2.4 2.1-5 7-6 12l-6.8 2.1C38.4 13.2 42.7 7.7 48 6.3zm12.5 18.3L38.8 31c.8-8.2 4.8-15.5 9.2-18.6l12.5-3.8v16zm1.5 0V13.3l8-2.5c.8 3.7.9 8.2.1 11.9l-8.1 1.9z"
      />
      {/* Right shadow panel */}
      <path
        fill={shadow}
        d="M92.4 115.9L59.1 124V13.3l.5-.2 8-2.5c.8 3.7.9 8.2.1 11.9l-8.1 1.9V124l33.3-8.1-4.1-52.9 4.6-1.5-4.5 54.4z"
      />
      {/* S letterform */}
      <path
        fill={letter}
        d="M59.1 63.8v-7.9s-2.2-1.2-6.5-1.2C41.4 54.7 35.8 62.2 35.8 70c0 9.5 9.1 9.7 9.1 15.1 0 1.4-1 3.2-3.3 3.2-3.5 0-7.7-3.6-7.7-3.6l-2.2 7.1s4.1 5.1 12.2 5.1c6.8 0 11.8-5.1 11.8-13 0-10.1-11.1-11.8-11.1-16 0-.8.2-3.8 5-3.8 3.6 0 5.9 1.3 5.9 1.3l3.6-1.6z"
      />
    </svg>
  )
}
