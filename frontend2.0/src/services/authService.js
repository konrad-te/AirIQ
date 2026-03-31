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

export async function updateUserPlan(token, plan) {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to update plan.'))
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

// ── Saved Locations ───────────────────────────────────────────────────────────

export async function getSavedLocations(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/locations`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => [])
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to load saved locations.'))
  return data
}

export async function addSavedLocation(token, { label, lat, lon }) {
  const response = await fetch(`${API_BASE_URL}/api/auth/locations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ label, lat, lon }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to save location.'))
  return data
}

export async function removeSavedLocation(token, locationId) {
  await fetch(`${API_BASE_URL}/api/auth/locations/${locationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── Email verification & Password reset ─────────────────────────────────────

export async function forgotPassword(email) {
  const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Request failed.'))
  return data
}

export async function resetPassword(token, newPassword) {
  const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Password reset failed.'))
  return data
}

export async function activateEmail(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/activate?token=${encodeURIComponent(token)}`)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Activation failed.'))
  return data
}

export async function resendActivation(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/resend-activation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to resend verification email.'))
  return data
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

export async function submitSuggestionFeedback(token, payload) {
  const response = await fetch(`${API_BASE_URL}/api/suggestion-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to submit suggestion feedback.'))
  return data
}

export async function getAdminSuggestionFeedback(token) {
  const response = await fetch(`${API_BASE_URL}/api/admin/suggestion-feedback`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to load suggestion feedback.'))
  return data
}

export async function markSuggestionFeedbackReviewed(token, feedbackId) {
  const response = await fetch(`${API_BASE_URL}/api/admin/suggestion-feedback/${feedbackId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(extractDetail(data, 'Failed to update suggestion feedback.'))
  }
}

export async function deleteSuggestionFeedback(token, feedbackId) {
  const response = await fetch(`${API_BASE_URL}/api/admin/suggestion-feedback/${feedbackId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(extractDetail(data, 'Failed to delete suggestion feedback.'))
  }
}

export async function getAdminStats(token) {
  const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to load admin stats.'))
  return data
}

export async function previewAdminSuggestions(token, context) {
  const response = await fetch(`${API_BASE_URL}/api/admin/suggestions/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(context),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to generate suggestion preview.'))
  return data
}

export async function getRecommendationConfig(token) {
  const response = await fetch(`${API_BASE_URL}/api/admin/recommendation-config`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to load recommendation settings.'))
  return data
}

export async function updateRecommendationConfig(token, updates) {
  const response = await fetch(`${API_BASE_URL}/api/admin/recommendation-config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(updates),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractDetail(data, 'Failed to update recommendation settings.'))
  return data
}
