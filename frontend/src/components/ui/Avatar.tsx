import styles from './Avatar.module.css'

export type AvatarSize = 'sm' | 'md' | 'lg'

export interface AvatarProps {
  displayName: string
  photoURL?: string | null
  size?: AvatarSize
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
}

/** Shows the user's photo when available, else their initials on a brand
 * surface. Used in the top bar profile element and (later) contact/org
 * owner avatars. */
export function Avatar({ displayName, photoURL, size = 'md' }: AvatarProps) {
  const className = `${styles.avatar} ${styles[size]}`
  if (photoURL) {
    return (
      <img className={className} src={photoURL} alt={displayName} referrerPolicy="no-referrer" />
    )
  }
  return (
    <span className={className} role="img" aria-label={displayName}>
      {initials(displayName)}
    </span>
  )
}
