import { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import { api } from '../api/client'
import { useAuth } from '../components/AuthContext'
import { MCQProvider, useMCQ } from '../components/MCQContext'

const SUBJECTS = ['DSA', 'DBMS', 'Compiler Design']

function getBadgeClass(level) {
  if (!level || level === 'unclassified') return 'badge badge-unclassified'
  return `badge badge-${level.toLowerCase()}`
}

// ─── Confirmation Modal ──────────────────────────────────────
function ConfirmModal({ isOpen, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onCancel}
    >
      <div
        className="card fade-up"
        style={{ maxWidth: 420, width: '100%', padding: '2rem' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem', textAlign: 'center' }}>
          {danger ? '⚠️' : '❓'}
        </div>
        <h3 style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
          {title}
        </h3>
        <p style={{ color: 'var(--text2)', textAlign: 'center', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary w-full" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn w-full ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            style={danger ? { background: 'var(--red)', color: '#fff', border: 'none' } : {}}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Overview ───────────────────────────────────────────────
function Overview({ students, results }) {
  const seen = {}
  const counts = { Weak: 0, Intermediate: 0, Advanced: 0 }
  results.forEach(r => {
    const key = `${r.student_email}_${r.subject}`
    if (!seen[key] || r.date_time > seen[key]) {
      seen[key] = r.date_time
      counts[r.classification] = (counts[r.classification] || 0) + 1
    }
  })

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Teacher Dashboard</h1>
        <p>Welcome back! Here's an overview of your class.</p>
      </div>

      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        {[
          { label: 'Total Students',  value: students.length, color: 'var(--accent2)' },
          { label: 'Tests Submitted', value: results.length,  color: 'var(--accent3)' },
          { label: 'Subjects Active', value: SUBJECTS.length, color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>
          Classification breakdown (latest attempt per student/subject)
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: '1rem' }}>
          Classification is per test attempt — not a global student property.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {[
            { l: 'Advanced',     color: 'var(--green)',  bg: 'rgba(74,222,128,0.1)' },
            { l: 'Intermediate', color: 'var(--yellow)', bg: 'rgba(251,191,36,0.1)' },
            { l: 'Weak',         color: 'var(--red)',    bg: 'rgba(248,113,113,0.1)' },
          ].map(({ l, color, bg }) => (
            <div
              key={l}
              style={{
                flex: 1, minWidth: 100,
                background: bg,
                border: `1px solid ${color}22`,
                borderRadius: 'var(--radius2)',
                padding: '1rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color, fontFamily: 'var(--font-head)' }}>
                {counts[l] || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginTop: '0.2rem' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Students ───────────────────────────────────────────────
function Students({ students, onRefresh }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState('')
  const [err, setErr]           = useState('')
  const [deleting, setDeleting] = useState(null)
  const [modal, setModal]       = useState(null) // { email, name }

  const handleAdd = async e => {
    e.preventDefault()
    setLoading(true); setMsg(''); setErr('')
    try {
      await api.addStudent(name, email, password)
      setMsg(`Student "${name}" added successfully!`)
      setName(''); setEmail(''); setPassword('')
      onRefresh()
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    const { email: targetEmail, name: targetName } = modal
    setModal(null)
    setDeleting(targetEmail)
    try {
      await api.removeStudent(targetEmail)
      setMsg(`Student "${targetName}" has been removed.`)
      onRefresh()
    } catch (e) {
      setErr(e.message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="fade-up">
      <ConfirmModal
        isOpen={!!modal}
        title="Remove Student"
        message={modal ? `Are you sure you want to permanently remove "${modal.name}" (${modal.email})? This will also delete all their test results and personalised assignments. This action cannot be undone.` : ''}
        confirmLabel="Yes, Remove"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => setModal(null)}
      />

      <div className="page-header"><h1>Student Management</h1><p>Add, view, and remove students</p></div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginBottom: '1.2rem', fontSize: '1rem' }}>Add New Student</h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {[
              { label: 'Full Name', val: name,     set: setName,     type: 'text',     ph: 'Alice Johnson' },
              { label: 'Email',     val: email,    set: setEmail,    type: 'email',    ph: 'alice@example.com' },
              { label: 'Password',  val: password, set: setPassword, type: 'password', ph: '••••••••' },
            ].map(f => (
              <div key={f.label} className="input-group">
                <label>{f.label}</label>
                <input
                  type={f.type}
                  className="input"
                  placeholder={f.ph}
                  value={f.val}
                  onChange={e => f.set(e.target.value)}
                  required
                />
              </div>
            ))}
            {msg && <div className="alert alert-success">{msg}</div>}
            {err && <div className="alert alert-danger">{err}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Adding…' : '+ Add Student'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1.2rem', fontSize: '1rem' }}>
            All Students ({students.length})
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th style={{ width: 80 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--text3)', textAlign: 'center' }}>No students yet</td>
                  </tr>
                )}
                {students.map(s => (
                  <tr key={s.email}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>{s.email}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                        disabled={deleting === s.email}
                        onClick={() => setModal({ email: s.email, name: s.name })}
                        title="Remove student"
                      >
                        {deleting === s.email ? '…' : '🗑 Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Generate MCQ ─────────────────────────────────────────────
function GenerateMCQ() {
  const {
    mcqState, setSubject, setTopic, setQuestions, setTitle,
    markPublished, updateQuestion, updateOption,
  } = useMCQ()

  const { subject, topic, questions, title, published } = mcqState
  const [loading,    setLoading]    = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [msg,        setMsg]        = useState(published ? `Assignment already published for ${subject}!` : '')
  const [err,        setErr]        = useState('')

  const generate = async () => {
    if (!topic.trim()) return
    setLoading(true); setErr(''); setMsg('')
    try {
      const data = await api.generateMCQ(subject, topic)
      if (!data || !Array.isArray(data.questions)) throw new Error('Invalid response from server')
      setQuestions(data.questions)
      setTitle(`${subject} - ${topic}`)
    } catch (e) {
      setErr('Failed to generate questions. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const publish = async () => {
    setPublishing(true); setErr(''); setMsg('')
    try {
      const cleanedQuestions = questions.map(q => ({
        id: String(q.id),
        question: String(q.question),
        options: {
          a: String(q.options?.a || ''),
          b: String(q.options?.b || ''),
          c: String(q.options?.c || ''),
          d: String(q.options?.d || ''),
        },
        correct_answer: q.correct_answer || 'a',
        topic: q.topic || topic,
      }))
      await api.publishAssignment(subject, title, cleanedQuestions)
      setMsg(`✅ New assignment published for ${subject}! All students can now attempt a fresh test.`)
      markPublished()
    } catch (e) {
      setErr(e.message || 'Failed to publish assignment')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Generate MCQ Assignment</h1>
        {questions.length > 0 && (
          <p style={{ color: 'var(--accent2)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            ✓ {questions.length} questions loaded — publishing creates a new assignment version
          </p>
        )}
      </div>

      

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ flex: '0 0 180px' }}>
            <label>Subject</label>
            <select className="input" value={subject} onChange={e => setSubject(e.target.value)}>
              {SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
            <label>Topic</label>
            <input
              className="input"
              placeholder="e.g. Binary Trees, SQL Joins…"
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={loading || !topic.trim()}>
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : '⚡ Generate MCQs'}
          </button>
        </div>
        {err && <div className="alert alert-danger" style={{ marginTop: '1rem' }}>{err}</div>}
      </div>

      {questions.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem' }}>Generated Questions ({questions.length})</h3>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <input
                className="input"
                placeholder="Assignment title…"
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{ width: 240 }}
              />
              <button className="btn btn-success" onClick={publish} disabled={publishing || !title.trim()}>
                {publishing ? 'Publishing…' : '📤 Publish New Version'}
              </button>
            </div>
          </div>

          {msg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{msg}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {questions.map((q, i) => (
              <div key={q.id} className="mcq-card">
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '6px', padding: '0.15rem 0.6rem', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0, marginTop: '0.1rem' }}>
                    Q{i + 1}
                  </span>
                  <textarea
                    className="input"
                    value={q.question}
                    onChange={e => updateQuestion(i, 'question', e.target.value)}
                    rows={2}
                    style={{ background: 'var(--bg3)' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {['a', 'b', 'c', 'd'].map(key => (
                    <div key={key} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <span
                        style={{
                          width: 24, height: 24, borderRadius: '6px',
                          background: q.correct_answer === key ? 'var(--green)' : 'var(--bg4)',
                          color: q.correct_answer === key ? '#000' : 'var(--text2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, cursor: 'pointer',
                        }}
                        onClick={() => updateQuestion(i, 'correct_answer', key)}
                      >
                        {key.toUpperCase()}
                      </span>
                      <input
                        className="input"
                        value={q.options[key]}
                        onChange={e => updateOption(i, key, e.target.value)}
                        style={{ fontSize: '0.85rem', padding: '0.4rem 0.7rem' }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>Correct:</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--green)', fontWeight: 600 }}>
                    {q.correct_answer?.toUpperCase()} — {q.options?.[q.correct_answer]}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text3)' }}>Tag: {q.topic}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Lab Assignments ─────────────────────────────────────────
function Labs() {
  const [subject,     setSubject]     = useState(SUBJECTS[0])
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [tasks,       setTasks]       = useState([''])
  const [loading,     setLoading]     = useState(false)
  const [msg,         setMsg]         = useState('')
  const [err,         setErr]         = useState('')

  const addTask    = ()       => setTasks(t => [...t, ''])
  const updateTask = (i, val) => setTasks(t => { const n = [...t]; n[i] = val; return n })
  const removeTask = i        => setTasks(t => t.filter((_, idx) => idx !== i))

  const submit = async e => {
    e.preventDefault()
    setLoading(true); setMsg(''); setErr('')
    try {
      await api.postLab(subject, title, description, tasks.filter(t => t.trim()))
      setMsg(`Lab posted for ${subject}!`)
      setTitle(''); setDescription(''); setTasks([''])
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fade-up">
      <div className="page-header"><h1>Post Lab Assignment</h1><p>Create lab work for students</p></div>
      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="grid-2">
            <div className="input-group">
              <label>Subject</label>
              <select className="input" value={subject} onChange={e => setSubject(e.target.value)}>
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Lab Title</label>
              <input className="input" placeholder="e.g. Implement BST" value={title} onChange={e => setTitle(e.target.value)} required />
            </div>
          </div>
          <div className="input-group">
            <label>Description</label>
            <textarea className="input" placeholder="Describe the lab objectives…" value={description} onChange={e => setDescription(e.target.value)} required />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 500 }}>Tasks</label>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={addTask}>
                + Add Task
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tasks.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ padding: '0.65rem 0.5rem', color: 'var(--text3)', fontSize: '0.85rem', flexShrink: 0 }}>{i + 1}.</span>
                  <input className="input" placeholder={`Task ${i + 1}…`} value={t} onChange={e => updateTask(i, e.target.value)} />
                  {tasks.length > 1 && (
                    <button type="button" className="btn btn-danger" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }} onClick={() => removeTask(i)}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {msg && <div className="alert alert-success">{msg}</div>}
          {err && <div className="alert alert-danger">{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Posting…' : '📤 Post Lab Assignment'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Results ─────────────────────────────────────────────────
function Results({ results, onRefresh }) {
  const [filterSubject, setFilterSubject]               = useState('All')
  const [filterClassification, setFilterClassification] = useState('All')

  const filtered = results.filter(r => {
    if (filterSubject !== 'All' && r.subject !== filterSubject) return false
    if (filterClassification !== 'All' && r.classification !== filterClassification) return false
    return true
  })

  return (
    <div className="fade-up">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Results Dashboard</h1>
          <p>All student test attempts — {results.length} total</p>
        </div>
        <button className="btn btn-secondary" onClick={onRefresh} style={{ marginTop: '0.5rem' }}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>Subject:</label>
          <select className="input" style={{ width: 'auto' }} value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option>All</option>
            {SUBJECTS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>Classification:</label>
          <select className="input" style={{ width: 'auto' }} value={filterClassification} onChange={e => setFilterClassification(e.target.value)}>
            <option>All</option>
            <option>Advanced</option>
            <option>Intermediate</option>
            <option>Weak</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
          Showing {filtered.length} of {results.length}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Subject</th>
                <th>Attempt #</th>
                <th>Score</th>
                <th>%</th>
                <th>Classification</th>
                <th>Date</th>
                <th>Weak Topics</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', padding: '2rem' }}>
                    {results.length === 0 ? "No results yet — students haven't submitted any tests." : 'No results match the current filters.'}
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.student_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{r.student_email}</div>
                  </td>
                  <td>{r.subject}</td>
                  <td>
                    <span style={{
                      background: 'var(--bg3)', border: '1px solid var(--border)',
                      borderRadius: '6px', padding: '0.1rem 0.5rem',
                      fontSize: '0.8rem', fontWeight: 600, color: 'var(--text2)',
                    }}>
                      #{r.attempt_number || 1}
                    </span>
                  </td>
                  <td>{r.score}/{r.total}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="progress-bar-wrap" style={{ width: 60 }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${r.score_percent}%`,
                            background: r.score_percent >= 75 ? 'var(--green)' : r.score_percent >= 40 ? 'var(--yellow)' : 'var(--red)',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.85rem' }}>{r.score_percent}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={getBadgeClass(r.classification)}>{r.classification}</span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
                    {r.date_time ? new Date(r.date_time).toLocaleString() : '—'}
                  </td>
                  <td>
                    {r.weak_topics?.length > 0
                      ? r.weak_topics.map(t => (
                          <span key={t} style={{ display: 'inline-block', background: 'rgba(248,113,113,0.1)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.75rem', padding: '0.1rem 0.4rem', marginRight: '0.25rem', marginBottom: '0.15rem' }}>
                            {t}
                          </span>
                        ))
                      : <span style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Teacher Layout ──────────────────────────────────────────
function TeacherDashboardInner() {
  const [page,     setPage]     = useState('overview')
  const [students, setStudents] = useState([])
  const [results,  setResults]  = useState([])

  const fetchStudents = async () => {
    try { const d = await api.getStudents(); setStudents(d.students) } catch { }
  }
  const fetchResults = async () => {
    try { const d = await api.getResults(); setResults(d.results) } catch { }
  }

  useEffect(() => {
    fetchStudents()
    fetchResults()
  }, [])

  useEffect(() => {
    if (page !== 'results') return
    const interval = setInterval(fetchResults, 30_000)
    return () => clearInterval(interval)
  }, [page])

  const pages = {
    overview: <Overview students={students} results={results} />,
    students: <Students students={students} onRefresh={fetchStudents} />,
    generate: <GenerateMCQ />,
    labs:     <Labs />,
    results:  <Results results={results} onRefresh={fetchResults} />,
  }

  return (
    <div>
      <Sidebar
        active={page}
        onNav={p => {
          setPage(p)
          if (p === 'results')  fetchResults()
          if (p === 'students') fetchStudents()
        }}
      />
      <main className="main-content">{pages[page]}</main>
    </div>
  )
}

export default function TeacherDashboard() {
  return (
    <MCQProvider>
      <TeacherDashboardInner />
    </MCQProvider>
  )
}
