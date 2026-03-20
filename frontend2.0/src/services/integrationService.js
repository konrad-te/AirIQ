const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export async function connectQingpingIntegration(token, appKey, appSecret) {
  const response = await fetch(`${API_BASE_URL}/api/integrations/qingping/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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
  const response = await fetch(`${API_BASE_URL}/api/integrations/qingping/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to load Qingping integration status.')
  }

  return data
}

export async function getQingpingDevices(token) {
  const response = await fetch(`${API_BASE_URL}/api/integrations/qingping/devices`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.detail || 'Failed to load Qingping devices.')
  }

  return data
}

export async function selectQingpingDevice(token, deviceId) {
  const response = await fetch(`${API_BASE_URL}/api/integrations/qingping/select-device`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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
