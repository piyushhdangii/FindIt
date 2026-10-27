import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { api, apiError } from '../services/api'

const today = new Date().toISOString().slice(0, 10)
const initial = { type: 'lost', itemName: '', category: '', description: '', color: '', eventDate: today, location: '' }

export default function ReportFormPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [form, setForm] = useState(initial)
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState('')
  const imageInput = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(Boolean(id))
  const navigate = useNavigate()
  useEffect(() => {
    if (!id) return
    api.get(`/reports/${id}`)
      .then(({ data }) => {
        const { report } = data
        if (report.reporter?._id !== user?._id && user?.role !== 'admin') {
          setError('You can only edit your own reports.')
          return
        }
        setForm({ type: report.type, itemName: report.itemName, category: report.category, description: report.description, color: report.color || '', eventDate: new Date(report.eventDate).toISOString().slice(0, 10), location: report.location })
        setPreview(report.image?.url || '')
      })
      .catch((requestError) => setError(apiError(requestError)))
      .finally(() => setLoading(false))
  }, [id, user?._id, user?.role])
  useEffect(() => {
    if (!preview.startsWith('blob:')) return undefined
    return () => URL.revokeObjectURL(preview)
  }, [preview])
  function change(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
  }
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = new FormData()
    for (const [key, value] of Object.entries(form)) body.append(key, value)
    if (image) body.append('image', image)
    try {
      const { data } = id ? await api.patch(`/reports/${id}`, body) : await api.post('/reports', body)
      navigate(data.matches?.length ? `/matches/${data.report._id}` : `/reports/${data.report._id}`, { state: { created: !id } })
    } catch (requestError) {
      setError(apiError(requestError))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="content-page form-page">
      <Link to="/dashboard" className="back-link"><ArrowLeft size={15} />Back to dashboard</Link>
      <div className="form-heading"><span className="eyebrow">HELP YOUR COMMUNITY HELP YOU</span><h1>{id ? 'Edit your report' : 'Share a report'}</h1><p>Clear details make it easier for the right person to spot a possible match.</p></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {loading && <p className="muted">Loading your report…</p>}
      <form className="report-form panel" onSubmit={submit}>
        <fieldset className="report-type-section"><legend>What happened?</legend><div className="choice-row">{[['lost', 'I lost something', 'Tell the community what you’re looking for.'], ['found', 'I found something', 'Help a neighbor find what they lost.']].map(([value, title, copy]) => <label key={value} className={`choice-card ${form.type === value ? 'selected' : ''}`}><input type="radio" name="type" value={value} checked={form.type === value} onChange={change} /><span className={`choice-symbol ${value}`}>{value === 'lost' ? '↗' : '⌕'}</span><b>{title}</b><small>{copy}</small></label>)}</div></fieldset>
        <section className="form-section" aria-labelledby="item-info-heading">
          <div className="form-section-heading"><span>01</span><div><h2 id="item-info-heading">Item information</h2><p>Start with the details people will recognize.</p></div></div>
          <div className="form-grid">
            <label>Item name<input name="itemName" required minLength="2" maxLength="120" value={form.itemName} onChange={change} placeholder="e.g. Blue canvas backpack" /></label>
            <label>Category<select name="category" required value={form.category} onChange={change}><option value="">Choose a category</option>{['Accessories', 'Bags', 'Books', 'Clothing', 'Electronics', 'Keys', 'Pets', 'Wallets', 'Other'].map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Color, if known<input name="color" maxLength="60" value={form.color} onChange={change} placeholder="e.g. Navy blue" /></label>
          </div>
        </section>
        <section className="form-section" aria-labelledby="when-where-heading">
          <div className="form-section-heading"><span>02</span><div><h2 id="when-where-heading">When and where</h2><p>A useful date and public location help narrow the search.</p></div></div>
          <div className="form-grid">
            <label>Date {form.type === 'lost' ? 'last seen' : 'found'}<input name="eventDate" type="date" required max={today} value={form.eventDate} onChange={change} /></label>
            <label>Where was it {form.type === 'lost' ? 'last seen' : 'found'}?<input name="location" required maxLength="160" value={form.location} onChange={change} placeholder="A public place or nearby landmark" /></label>
          </div>
        </section>
        <section className="form-section" aria-labelledby="details-heading">
          <div className="form-section-heading"><span>03</span><div><h2 id="details-heading">Additional details</h2><p>Share helpful public information, not private proof of ownership.</p></div></div>
          <div className="form-grid">
            <label className="form-full">Description<textarea name="description" required minLength="10" maxLength="2000" rows="4" value={form.description} onChange={change} placeholder="Describe a few public details that could help identify the item." /><small>Keep private identifying details for the private chat after a claim, not in this public report.</small></label>
          </div>
        </section>
        <section className="form-section photo-section" aria-labelledby="photo-heading">
          <div className="form-section-heading"><span>04</span><div><h2 id="photo-heading">Add a photo <span>(optional)</span></h2><p>A clear image may help the right person recognize the item.</p></div></div>
          <label className="photo-upload"><ImagePlus size={22} /><span><b>{image ? 'Photo selected' : 'Choose an item photo'}</b><small>{image ? image.name : 'JPEG, PNG, WebP, or AVIF · optional'}</small></span><span className="button button-quiet" aria-hidden="true">Browse files</span><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; setImage(file || null); setPreview(file ? URL.createObjectURL(file) : '') }} /></label>
          {preview && <div className="image-preview-wrap"><img className="image-preview" src={preview} alt="Preview of selected item" />{image && <button className="text-link" type="button" onClick={() => { setImage(null); setPreview(''); if (imageInput.current) imageInput.current.value = '' }}>Remove selected photo</button>}</div>}
          <small className="upload-note">Photo uploads work only when the server is configured with Cloudinary. You can still submit a report without a photo.</small>
        </section>
        <div className="form-actions"><Link className="button button-quiet" to="/dashboard">Cancel</Link><button className="button button-primary" disabled={busy || loading}>{busy ? 'Saving…' : id ? 'Save changes' : 'Share report'}</button></div>
      </form>
    </section>
  )
}
