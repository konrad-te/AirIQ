const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function extractDetail(data, fallback) {
  if (!data || !data.detail) return fallback
  if (typeof data.detail === 'string') return data.detail
  // Pydantic v2 validation errors: detail is an array of error objects
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    const first = data.detail[0]
    if (typeof first.msg === 'string') return first.msg
  }
  return fallback
}

export async function loginUser(email, password) {
  const body = new URLSearchParams({ username: email, password })
  const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(extractDetail(data, 'Login failed.'))
  }
  return data
}

export async function logoutUser(token) {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function registerUser(email, password, displayName) {
  const response = await fetch(`${API_BASE_URL}/api/auth/user/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      display_name: displayName || null,
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(extractDetail(data, 'Registration failed.'))
  }
  return data
}

export async function getCurrentUser(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error('Session expired.')
  }
  return response.json()
}

export async function updateProfile(token, { display_name, email }) {
  const body = { display_name }
  if (email !== undefined) body.email = email
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to update profile.'))
  return data
}

export async function getPreferences(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to load preferences.'))
  return data
}

export async function updatePreferences(token, prefs) {
  const response = await fetch(`${API_BASE_URL}/api/auth/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(prefs),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to update preferences.'))
  return data
}

export async function changePassword(token, { current_password, new_password }) {
  const response = await fetch(`${API_BASE_URL}/api/auth/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ current_password, new_password }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(extractDetail(data, 'Failed to change password.'))
  }
}

export async function getSessions(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to load sessions.'))
  return data
}

export async function revokeSession(token, sessionId) {
  await fetch(`${API_BASE_URL}/api/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function deleteAccount(token, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(extractDetail(data, 'Failed to delete account.'))
  }
}

export async function revokeAllOtherSessions(token) {
  await fetch(`${API_BASE_URL}/api/auth/sessions`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export async function submitFeedback(token, { category, message }) {
  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ category, message }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to submit feedback.'))
  return data
}

export async function getAdminFeedback(token) {
  const response = await fetch(`${API_BASE_URL}/api/admin/feedback`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to load feedback.'))
  return data
}

export async function markFeedbackRead(token, feedbackId) {
  const response = await fetch(`${API_BASE_URL}/api/admin/feedback/${feedbackId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(extractDetail(data, 'Failed to update feedback.'))
  }
}

export async function deleteFeedback(token, feedbackId) {
  const response = await fetch(`${API_BASE_URL}/api/admin/feedback/${feedbackId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(extractDetail(data, 'Failed to delete feedback.'))
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function getAdminStats(token) {
  const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to load admin stats.'))
  return data
}
