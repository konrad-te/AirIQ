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
