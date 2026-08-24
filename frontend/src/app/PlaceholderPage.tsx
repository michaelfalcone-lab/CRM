import { Card } from '../components/ui'

export interface PlaceholderPageProps {
  title: string
  description?: string
}

/** Route stub for a nav item whose real feature UI lands in a later Phase 1
 * task. Every feature page in this task renders one of these. */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <Card>
      <h2>{title}</h2>
      <p>{description ?? 'This screen is coming in a later Phase 1 task.'}</p>
    </Card>
  )
}
