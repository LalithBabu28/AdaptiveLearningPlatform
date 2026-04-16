import { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import AdaptiveResult from '../components/AdaptiveResult'
import { api } from '../api/client'
import { useAuth } from '../components/AuthContext'

const SUBJECTS = ['DSA', 'DBMS', 'Compiler Design']
const SUBJECT_ICONS = { DSA: '🌳', DBMS: '🗄️', 'Compiler Design': '⚙️' }

function classificationColor(c) {
  if (c === 'Advanced')     return 'var(--green)'
  if (c === 'Intermediate') return 'var(--yellow)'
  if (c === 'Weak')         return 'var(--red)'
  return 'var(--text3)'
}

/**
 * Derives a display state for a subject button given its attemptInfo.
 * Returns: { label, sublabel, color, locked, canStart }
 */
function getSubjectState(info) {
  if (!info || !info.attempted) {
    return {
      label: 'Start Test →',
      sublabel: 'Not attempted',
      color: 'var(--text3)',
      locked: false,
      canStart: true,
      tag: null,
    }
  }

  const { classification, retake_type, can_retake, attempts_remaining, score_percent } = info

  if (retake_type === 'new_assignment') {
    return {
      label: '🆕 New Test Available →',
      sublabel: `Previous: ${score_percent}% (${classification})`,
      color: 'var(--accent2)',
      locked: false,
      canStart: true,
      tag: { text: 'New Version', color: 'var(--accent2)', bg: 'rgba(167,139,250,0.12)' },
    }
  }

  if (classification === 'Advanced') {
    return {
      label: 'Go to Lab →',
      sublabel: `${score_percent}% — Completed`,
      color: 'var(--green)',
      locked: true,
      canStart: false,
      tag: { text: '✓ Advanced — Completed', color: 'var(--green)', bg: 'rgba(74,222,128,0.12)' },
    }
  }

  if (classification === 'Intermediate') {
    if (can_retake) {
      return {
        label: '↑ Improve Score →',
        sublabel: `${score_percent}% — ${attempts_remaining} attempt${attempts_remaining !== 1 ? 's' : ''} left`,
        color: 'var(--yellow)',
        locked: false,
        canStart: true,
        tag: { text: `Intermediate — ${attempts_remaining} left`, color: 'var(--yellow)', bg: 'rgba(251,191,36,0.12)' },
      }
    }
    return {
      label: 'Max Attempts Reached',
      sublabel: `${score_percent}% — Lab access unlocked`,
      color: 'var(--yellow)',
      locked: true,
      canStart: false,
      tag: { text: '✓ Intermediate — Lab Unlocked', color: 'var(--yellow)', bg: 'rgba(251,191,36,0.12)' },
    }
  }

  // Weak
  return {
    label: '↻ Retake Test →',
    sublabel: `${score_percent}% — Focus on weak topics`,
    color: 'var(--red)',
    locked: false,
    canStart: true,
    tag: { text: '↻ Retake (Weak)', color: 'var(--red)', bg: 'rgba(248,113,113,0.12)' },
  }
}

// ─── Dashboard Home ──────────────────────────────────────────
function Home({ user, results, onNav }) {
  const latestBySubject = {}
  results.forEach(r => {
    if (!latestBySubject[r.subject] || r.date_time > latestBySubject[r.subject].date_time) {
      latestBySubject[r.subject] = r
    }
  })

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Welcome, {user.name.split(' ')[0]}!</h1>
        <p>Your adaptive learning journey continues here.</p>
      </div>

      <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--text2)' }}>SUBJECTS</h3>
      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        {SUBJECTS.map(s => {
          const res = latestBySubject[s]
          return (
            <div
              key={s}
              className="card"
              style={{ cursor: 'pointer', transition: 'border-color 0.2s' }}
              onClick={() => onNav('test')}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{SUBJECT_ICONS[s]}</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-head)', marginBottom: '0.5rem' }}>{s}</div>
              {res ? (
                <div>
                  <div className="progress-bar-wrap" style={{ marginBottom: '0.4rem' }}>
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${res.score_percent}%`, background: classificationColor(res.classification) }}
                    />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
                    Last: {res.score_percent}%
                    <span style={{ marginLeft: '0.5rem', color: classificationColor(res.classification), fontWeight: 600 }}>
                      {res.classification}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>Not attempted</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MCQ Test ─────────────────────────────────────────────────
function MCQTest({ user, onTestDone, onGoToLab }) {
  const [subject, setSubject]         = useState('')
  const [assignment, setAssignment]   = useState(null)
  const [answers, setAnswers]         = useState({})
  const [result, setResult]           = useState(null)
  const [loading, setLoading]         = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [err, setErr]                 = useState('')
  const [timeLeft, setTimeLeft]       = useState(null)
  const [attemptInfo, setAttemptInfo] = useState({})
  const timerRef = useRef(null)

  // Load attempt status for all subjects once
  useEffect(() => {
    const fetchAttempts = async () => {
      const info = {}
      await Promise.all(
        SUBJECTS.map(async s => {
          try { info[s] = await api.checkAttempt(user.email, s) }
          catch { info[s] = { attempted: false, can_retake: true, classification: null } }
        })
      )
      setAttemptInfo(info)
    }
    fetchAttempts()
  }, []) // eslint-disable-line

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [timeLeft])

  const loadTest = async () => {
    setLoading(true); setErr(''); setResult(null); setAnswers({})
    try {
      const info = attemptInfo[subject]
      const retakeType = info?.retake_type

      if (retakeType === 'weak') {
        const data = await api.regenerateForWeak(user.email, subject)
        setAssignment(data)
        setTimeLeft(data.questions.length * 90)
      } else if (retakeType === 'intermediate') {
        const data = await api.regenerateForIntermediate(user.email, subject)
        setAssignment(data)
        setTimeLeft(data.questions.length * 90)
      } else {
        // First attempt or new assignment version
        const data = await api.getAssignment(subject)
        setAssignment(data)
        setTimeLeft(data.questions.length * 90)
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const submitTest = async () => {
    setSubmitting(true); setErr('')
    try {
      const data = await api.submitTest(user.email, subject, answers)
      setResult(data)
      onTestDone()
      try {
        const info = await api.checkAttempt(user.email, subject)
        setAttemptInfo(prev => ({ ...prev, [subject]: info }))
      } catch { /* ignore */ }
    } catch (e) {
      setErr(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetake = async () => {
    setResult(null); setAssignment(null); setAnswers({})
    try {
      const info = await api.checkAttempt(user.email, subject)
      setAttemptInfo(prev => ({ ...prev, [subject]: info }))
    } catch { /* ignore */ }
  }

  const formatTime = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const answered = Object.keys(answers).length
  const total    = assignment?.questions?.length || 0

  if (result) {
    return (
      <AdaptiveResult
        result={result}
        subject={subject}
        onRetake={handleRetake}
        onGoToLab={onGoToLab}
      />
    )
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>MCQ Test</h1>
        <p>Select a subject and start your assessment</p>
      </div>

      {!assignment && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3 style={{ marginBottom: '1.2rem', fontSize: '1rem' }}>Choose Subject</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {SUBJECTS.map(s => {
              const info = attemptInfo[s]
              const state = getSubjectState(info)

              return (
                <button
                  key={s}
                  className={`option-btn ${subject === s ? 'selected' : ''} ${state.locked ? 'locked' : ''}`}
                  onClick={() => !state.locked && setSubject(s)}
                  disabled={state.locked}
                  style={state.locked ? { opacity: 0.55, cursor: 'not-allowed' } : {}}
                >
                  <span style={{ fontSize: '1.2rem' }}>{SUBJECT_ICONS[s]}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{s}</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: state.locked ? 'var(--text3)' : state.color, marginTop: '0.1rem' }}>
                      {state.sublabel}
                    </span>
                  </span>
                  {state.tag && (
                    <span style={{
                      fontSize: '0.72rem',
                      background: state.tag.bg,
                      color: state.tag.color,
                      border: `1px solid ${state.tag.color}44`,
                      borderRadius: '100px',
                      padding: '0.15rem 0.65rem',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {state.tag.text}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Context-aware retake notice */}
          {subject && (() => {
            const info = attemptInfo[subject]
            if (!info?.attempted) return null
            const { retake_type, score_percent } = info

            if (retake_type === 'new_assignment') return (
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                <div>
                  <strong>🆕 New Assignment Available</strong>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    The teacher has published a new assignment. Your previous score of {score_percent}% is saved.
                  </div>
                </div>
              </div>
            )

            if (retake_type === 'weak') return (
              <div className="alert alert-warn" style={{ marginBottom: '1rem' }}>
                <div>
                  <strong>⚠ Retake Mode — Weak Topics Focus</strong>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    You scored below 40%. A personalised set focusing on your weak topics will be generated.
                  </div>
                </div>
              </div>
            )

            if (retake_type === 'intermediate') return (
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                <div>
                  <strong>↑ Improvement Attempt</strong>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    You scored {score_percent}%. You have {info.attempts_remaining} attempt{info.attempts_remaining !== 1 ? 's' : ''} remaining on this assignment.
                  </div>
                </div>
              </div>
            )
            return null
          })()}

          {err && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{err}</div>}

          {subject && !attemptInfo[subject]?.can_retake && attemptInfo[subject]?.attempted && (
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
              <div>
                <strong>✓ Completed — Lab Access Granted</strong>
                <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  You've reached the maximum attempts for this assignment.
                  Head to <strong>Lab Work</strong> to continue.
                </div>
              </div>
            </div>
          )}

          <button
            className="btn btn-primary w-full btn-lg"
            onClick={loadTest}
            disabled={!subject || loading || (subject && !getSubjectState(attemptInfo[subject]).canStart)}
          >
            {loading
              ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                  {' '}
                  {attemptInfo[subject]?.retake_type === 'weak'
                    ? 'Generating weak-topic questions…'
                    : attemptInfo[subject]?.retake_type === 'intermediate'
                    ? 'Generating improvement set…'
                    : 'Loading…'}
                </>
              )
              : subject
              ? getSubjectState(attemptInfo[subject]).label
              : 'Select a subject first'
            }
          </button>
        </div>
      )}

      {assignment && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>{assignment.title}</span>
              <div style={{ fontSize: '0.9rem', color: 'var(--text2)', marginTop: '0.2rem' }}>
                {answered}/{total} answered
              </div>
            </div>
            {timeLeft !== null && (
              <div style={{
                background: timeLeft < 60 ? 'rgba(248,113,113,0.15)' : 'var(--bg3)',
                border: `1px solid ${timeLeft < 60 ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 'var(--radius2)',
                padding: '0.4rem 1rem',
                fontFamily: 'var(--font-head)',
                fontSize: '1.1rem',
                color: timeLeft < 60 ? 'var(--red)' : 'var(--text)',
              }}>
                ⏱ {formatTime(timeLeft)}
              </div>
            )}
          </div>

          <div className="progress-bar-wrap" style={{ marginBottom: '1.5rem' }}>
            <div className="progress-bar-fill" style={{ width: `${(answered / total) * 100}%`, background: 'var(--accent)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {assignment.questions.map((q, i) => (
              <div key={q.id} className="mcq-card">
                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', alignItems: 'flex-start' }}>
                  <span style={{
                    background: answers[q.id] ? 'var(--accent)' : 'var(--bg4)',
                    color: answers[q.id] ? '#fff' : 'var(--text3)',
                    borderRadius: '6px', padding: '0.15rem 0.5rem',
                    fontSize: '0.78rem', fontWeight: 700, flexShrink: 0, marginTop: 2,
                  }}>
                    Q{i + 1}
                  </span>
                  <p style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{q.question}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {['a', 'b', 'c', 'd'].map(key => (
                    <button
                      key={key}
                      className={`option-btn ${answers[q.id] === key ? 'selected' : ''}`}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: key }))}
                    >
                      <span className="option-key">{key.toUpperCase()}</span>
                      {q.options[key]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {err && <div className="alert alert-danger" style={{ marginTop: '1rem' }}>{err}</div>}

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={submitTest}
              disabled={submitting || answered < total}
            >
              {submitting
                ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Submitting…</>
                : answered < total
                ? `Answer all questions (${total - answered} left)`
                : 'Submit Test ✓'
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Lab Access ──────────────────────────────────────────────
function LabPage({ user }) {
  const [subject, setSubject] = useState('')
  const [lab, setLab]         = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')

  const loadLab = async () => {
    setLoading(true); setErr(''); setLab(null)
    try {
      const data = await api.getLab(subject, user.email)
      setLab(data)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Lab Assignments</h1>
        <p>Hands-on practice tasks — available after passing the MCQ test</p>
      </div>

      {!lab && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h3 style={{ marginBottom: '1.2rem', fontSize: '1rem' }}>Select Subject</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {SUBJECTS.map(s => (
              <button
                key={s}
                className={`option-btn ${subject === s ? 'selected' : ''}`}
                onClick={() => setSubject(s)}
              >
                <span style={{ fontSize: '1.2rem' }}>{SUBJECT_ICONS[s]}</span>
                {s}
              </button>
            ))}
          </div>
          {err && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              {err.includes('Weak') || err.includes('score') ? (
                <div>
                  <strong>🔒 Access Denied</strong>
                  <div style={{ marginTop: '0.35rem', fontSize: '0.88rem' }}>{err}</div>
                </div>
              ) : err}
            </div>
          )}
          <button
            className="btn btn-primary w-full btn-lg"
            onClick={loadLab}
            disabled={!subject || loading}
          >
            {loading ? 'Loading…' : 'View Lab →'}
          </button>
        </div>
      )}

      {lab && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setLab(null)}>← Back</button>
            <h2 style={{ fontSize: '1.2rem' }}>{lab.title}</h2>
            <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text2)' }}>{lab.subject}</span>
          </div>

          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ marginBottom: '0.6rem', fontSize: '0.9rem', color: 'var(--text3)', letterSpacing: '0.06em' }}>DESCRIPTION</h3>
            <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{lab.description}</p>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text3)', letterSpacing: '0.06em' }}>TASKS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {lab.tasks.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '0.85rem', padding: '0.85rem 1rem',
                  background: 'var(--bg3)', borderRadius: 'var(--radius2)',
                  border: '1px solid var(--border)',
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: '8px',
                    background: 'var(--accent)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                    fontFamily: 'var(--font-head)',
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ lineHeight: 1.7 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AI Tutor Chat ────────────────────────────────────────────
function ChatPage({ user }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your AI tutor. Ask me anything about your subjects — I'll guide you with hints, not direct answers. What would you like to explore?",
    },
  ])
  const [input, setInput]     = useState('')
  const [subject, setSubject] = useState('DSA')
  const [loading, setLoading] = useState(false)
  const bottomRef             = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const data = await api.chat(msg, subject, history)
      setMessages(m => [...m, { role: 'assistant', content: data.response }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, I had trouble connecting. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="fade-up" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: '1rem', flexShrink: 0 }}>
        <h1>AI Tutor</h1>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {SUBJECTS.map(s => (
            <button key={s} className={`subject-pill ${subject === s ? 'active' : ''}`} onClick={() => setSubject(s)}>
              {SUBJECT_ICONS[s]} {s}
            </button>
          ))}
        </div>
      </div>

      <div className="chat-wrap" style={{ flex: 1 }}>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && <div className="chat-bot-label">AI TUTOR</div>}
              <div className={`chat-bubble ${m.role === 'user' ? 'user' : 'bot'}`}>
                {m.role === 'assistant'
                  ? m.content.split('\n').map((line, idx) => {
                      if (line.trim() === '---') return <hr key={idx} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />
                      if (line.trim() === '') return <div key={idx} style={{ height: '0.4rem' }} />
                      const isStep = /^\d+\./.test(line.trim())
                      const isQuestion = line.startsWith('💬')
                      return (
                        <div key={idx} style={{ display: 'block', marginBottom: isStep ? '0.5rem' : '0', color: isQuestion ? 'var(--accent2)' : 'inherit', fontWeight: isQuestion ? 600 : 'inherit', fontStyle: isQuestion ? 'italic' : 'normal' }}>
                          {line}
                        </div>
                      )
                    })
                  : m.content
                }
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div className="chat-bot-label">AI TUTOR</div>
              <div className="chat-bubble bot" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                <span style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask about ${subject}… (Enter to send)`}
            rows={1}
          />
          <button className="btn btn-primary" onClick={send} disabled={!input.trim() || loading} style={{ padding: '0.65rem 1.1rem', flexShrink: 0 }}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Student Layout ──────────────────────────────────────────
export default function StudentDashboard() {
  const { user }              = useAuth()
  const [page, setPage]       = useState('dashboard')
  const [results, setResults] = useState([])

  const fetchResults = async () => {
    try {
      const d = await api.getStudentResults(user.email)
      setResults(d.results)
    } catch { /* silently ignore */ }
  }

  useEffect(() => { fetchResults() }, []) // eslint-disable-line

  const pages = {
    dashboard: <Home user={user} results={results} onNav={setPage} />,
    test: (
      <MCQTest
        user={user}
        onTestDone={fetchResults}
        onGoToLab={() => setPage('lab')}
      />
    ),
    lab:  <LabPage user={user} />,
    chat: <ChatPage user={user} />,
  }

  return (
    <div>
      <Sidebar active={page} onNav={setPage} />
      <main className="main-content">{pages[page]}</main>
    </div>
  )
}
