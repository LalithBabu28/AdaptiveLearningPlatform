const BASE = '/api'

async function request(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) options.body = JSON.stringify(body)

  let response
  try {
    response = await fetch(`${BASE}${path}`, options)
  } catch (err) {
    throw new Error('Network error: Unable to reach server')
  }

  // Try to parse JSON regardless of status
  let data = null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      data = await response.json()
    } catch {
      const text = await response.text().catch(() => '')
      throw new Error(`Server returned malformed JSON: ${text.slice(0, 200)}`)
    }
  } else {
    // Non-JSON body (HTML error page, plain text, etc.)
    const text = await response.text().catch(() => '')
    if (!response.ok) {
      throw new Error(`Server error ${response.status}: ${text.slice(0, 300)}`)
    }
    return text
  }

  if (!response.ok) {
    // FastAPI detail field or fallback
    throw new Error(data?.detail || data?.message || `Request failed (${response.status})`)
  }

  return data
}

export const api = {
  // AUTH
  login: (email, password, role) =>
    request('POST', '/login', { email, password, role }),

  // STUDENTS
  getStudents: () => request('GET', '/students'),
  addStudent: (name, email, password) =>
    request('POST', '/add-student', { name, email, password }),
  removeStudent: (email) =>
    request('DELETE', `/remove-student/${encodeURIComponent(email)}`),

  // ASSIGNMENTS
  generateMCQ: (subject, topic) =>
    request('POST', '/generate-mcq', { subject, topic }),
  publishAssignment: (subject, title, questions) =>
    request('POST', '/publish-assignment', { subject, title, questions }),
  getAssignment: (subject) =>
    request('GET', `/assignments/${subject}`),

  // TESTS
  submitTest: (email, subject, answers) =>
    request('POST', '/submit-test', { student_email: email, subject, answers }),
  checkAttempt: (email, subject) =>
    request('GET', `/check-attempt/${encodeURIComponent(email)}/${encodeURIComponent(subject)}`),

  // RETAKE
  regenerateForWeak: (email, subject) =>
    request('POST', `/regenerate-for-weak?student_email=${encodeURIComponent(email)}&subject=${encodeURIComponent(subject)}`),
  regenerateForIntermediate: (email, subject) =>
    request('POST', `/regenerate-for-intermediate?student_email=${encodeURIComponent(email)}&subject=${encodeURIComponent(subject)}`),

  // LABS
  getLab: (subject, email) =>
    request('GET', `/lab/${subject}?student_email=${encodeURIComponent(email)}`),
  postLab: (subject, title, description, tasks) =>
    request('POST', '/post-lab', { subject, title, description, tasks }),

  // CHAT
  chat: (message, subject, conversation_history = []) =>
    request('POST', '/chat', { message, subject, conversation_history }),

  // ANALYSIS
  analyzePerformance: (subject, classification, weak_topics, wrong_questions) =>
    request('POST', '/analyze-performance', {
      subject, classification, weak_topics, wrong_questions,
    }),

  // RESULTS
  getResults: () => request('GET', '/results'),
  getStudentResults: (email) =>
    request('GET', `/results/${encodeURIComponent(email)}`),
}