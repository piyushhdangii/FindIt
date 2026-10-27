import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  return <section className="not-found"><span className="eyebrow">404 · WRONG TURN</span><h1>This page got lost.</h1><p>We couldn’t find that page, but you can head back to the community board.</p><Link className="button button-primary" to="/"><ArrowLeft size={16} />Back to FindIt</Link></section>
}
