const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function requireAuthToken(token) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('Please sign in again to use Qingping integration.')
  }
  return token
}

export async function connectQingpingIntegration(token, appKey, appSecret) {
  const authToken = requireAuthToken(token)
  const response = await fetch(`${API_BASE_URL}/api/integrations/qingping/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      app_key: appKey,
      app_secret: appSecret,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to connect Qingping integration.')
  }

  return data
}

export async function getQingpingIntegrationStatus(token) {
  const authToken = requireAuthToken(token)
  const response = await fetch(`${API_BASE_URL}/api/integrations/qingping/status`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to load Qingping integration status.')
  }

  return data
}

export async function getQingpingDevices(token) {
  const authToken = requireAuthToken(token)
  const response = await fetch(`${API_BASE_URL}/api/integrations/qingping/devices`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to load Qingping devices.')
  }

  return data
}

export async function selectQingpingDevice(token, deviceId) {
  const authToken = requireAuthToken(token)
  const response = await fetch(`${API_BASE_URL}/api/integrations/qingping/select-device`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      device_id: deviceId,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to select Qingping device.')
  }

  return data
}

export async function getStravaIntegrationStatus(token) {
  const authToken = requireAuthToken(token)
  const response = await fetch(`${API_BASE_URL}/api/integrations/strava/status`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to load Strava integration status.')
  }

  return data
}

export async function getStravaConnectUrl(token) {
  const authToken = requireAuthToken(token)
  const response = await fetch(`${API_BASE_URL}/api/integrations/strava/connect-url`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to prepare Strava connection.')
  }

  return data
}

export async function syncStravaActivities(token) {
  const authToken = requireAuthToken(token)
  const response = await fetch(`${API_BASE_URL}/api/integrations/strava/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to sync Strava activities.')
  }

  return data
}
