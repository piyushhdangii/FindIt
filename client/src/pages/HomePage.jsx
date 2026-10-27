import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, Heart, MapPin, ShieldCheck, Sparkles, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import ReportCard from '../components/ReportCard'
import Loading from '../components/Loading'
import { CheckerboardSticker, StripeSticker } from '../components/DesignStickers'
import { api } from '../services/api'

export default function HomePage() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    api.get('/reports?limit=3').then(({ data }) => setReports(data.reports)).catch(() => setReports([])).finally(() => setLoading(false))
  }, [])

  function searchReports(event) {
    event.preventDefault()
    navigate(`/reports?search=${encodeURIComponent(search)}`)
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker-row"><span className="kicker"><Sparkles size={15} /> A COMMUNITY THAT CARES</span><CheckerboardSticker className="hero-checker" /></div>
          <h1>LOST<br />SOMETHING?<br /><span className="hero-highlight">LET’S FIND IT.</span></h1>
          <p>Small details can make a big difference. Share what’s missing, explore what’s been found, and let your community help bring it home.</p>
          <form className="hero-search" onSubmit={searchReports}>
            <Search size={19} /><input aria-label="Search items" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Try “blue backpack” or “Central Park”" />
            <button className="button button-primary" type="submit">Search <ArrowRight size={16} /></button>
          </form>
          <div className="hero-links"><Link to="/reports/new">Post a lost or found item <ArrowUpRight size={15} /></Link><span>Free for everyone in the community</span></div>
        </div>
        <div className="hero-art" aria-label="Illustration representing a community finding lost belongings">
          <CheckerboardSticker className="art-checker" />
          <div className="art-blob"><div className="bag"><span className="bag-handle" /><span className="bag-dot" /></div></div>
          <div className="float-card float-card-top"><span className="float-icon"><Search size={17} /></span><span><b>Look out for each other</b><small>Community-powered discovery</small></span></div>
          <div className="float-card float-card-bottom"><span className="float-avatar"><Heart size={16} /></span><span><b>Every detail matters</b><small>Share only what helps</small></span><ArrowUpRight size={17} /></div>
          <span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✦</span>
          <StripeSticker className="art-stripes" />
        </div>
      </section>
      <section className="trust-strip">
        <div><span className="trust-icon"><ShieldCheck size={19} /></span><span><b>People-first, always</b><small>Your details stay in your control</small></span></div>
        <div><span className="trust-icon"><Sparkles size={19} /></span><span><b>Thoughtful suggestions</b><small>Helpful clues, not guesses</small></span></div>
        <div><span className="trust-icon"><Heart size={19} /></span><span><b>Powered by neighbors</b><small>One community, looking out</small></span></div>
      </section>
      <section className="section-block">
        <div className="section-heading"><div><span className="eyebrow">THE COMMUNITY BOARD</span><h2>Recently shared</h2><p>A few things neighbors are looking for or have found.</p></div><Link className="text-link" to="/reports">Explore all reports <ArrowRight size={16} /></Link></div>
        {loading ? <Loading label="Finding recent reports" /> : reports.length ? <div className="report-grid">{reports.map((report) => <ReportCard key={report._id} report={report} />)}</div> : <div className="empty-state"><MapPin size={24} /><h3>Your community board starts here</h3><p>When someone shares a report, you’ll see it here.</p><Link className="button button-primary" to="/reports/new">Share a report</Link></div>}
      </section>
      <section className="how-section">
        <div className="how-heading"><CheckerboardSticker /><span><span className="eyebrow">A SIMPLE WAY TO HELP</span><h2>Every detail<br />brings it closer.</h2></span></div>
        <div className="how-steps"><article><span>01</span><h3>Tell us what’s missing</h3><p>Add a few useful details, like the item, color, date, and where it was last seen.</p></article><article><span>02</span><h3>See helpful suggestions</h3><p>FindIt compares the details in lost and found reports to surface possible matches.</p></article><article><span>03</span><h3>Reconnect, together</h3><p>Reach out with a private claim and work with the finder to verify the item.</p></article></div>
      </section>
    </>
  )
}
