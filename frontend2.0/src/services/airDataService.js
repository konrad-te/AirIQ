const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export async function getAirQualityData(lat, lon) {
  const response = await fetch(
    `${API_BASE_URL}/api/air-quality?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
  )

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`)
  }

  return response.json()
}

export async function geocodeAddress(address) {
  const response = await fetch(
    `${API_BASE_URL}/api/geocode?address=${encodeURIComponent(address)}`,
  )

  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Address not found.' : `Geocoding failed with status ${response.status}`)
  }

  return response.json()
}

export async function suggestAddresses(query, limit = 5) {
  const response = await fetch(
    `${API_BASE_URL}/api/geocode/suggest?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`,
  )

  if (!response.ok) {
    throw new Error(`Suggestion lookup failed with status ${response.status}`)
  }

  return response.json()
}

export async function getAiRecommendation(outdoorData, indoorData, token) {
  const response = await fetch(`${API_BASE_URL}/api/ai/recommendation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ outdoor: outdoorData, indoor: indoorData }),
  })

  if (!response.ok) {
    let detail = `AI request failed with status ${response.status}`
    try {
      const payload = await response.json()
      if (payload?.detail) detail = payload.detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }

  return response.json()
}

export async function reverseGeocodeCoordinates(lat, lon) {
  const response = await fetch(
    `${API_BASE_URL}/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
  )

  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Location could not be resolved.' : `Reverse geocoding failed with status ${response.status}`)
  }

  return response.json()
}

export async function getIndoorSensorData(token) {
  const response = await fetch(`${API_BASE_URL}/api/sensor/home/latest`, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    let detail = `Sensor request failed with status ${response.status}`

    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = payload.detail
      }
    } catch {
      // Ignore JSON parse failures and keep the generic message.
    }

    throw new Error(detail)
  }

  return response.json()
}

export async function getIndoorSensorHistory(token, range = '24h') {
  const response = await fetch(
    `${API_BASE_URL}/api/sensor/home/history?range=${encodeURIComponent(range)}`,
    {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!response.ok) {
    let detail = `Sensor history request failed with status ${response.status}`

    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = payload.detail
      }
    } catch {
      // Ignore JSON parse failures and keep the generic message.
    }

    throw new Error(detail)
  }

  return response.json()
}

export async function getSleepHistory(token, range = '30d') {
  const response = await fetch(
    `${API_BASE_URL}/api/sleep/history?range=${encodeURIComponent(range)}`,
    {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!response.ok) {
    let detail = `Sleep history request failed with status ${response.status}`

    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = payload.detail
      }
    } catch {
      // Ignore JSON parse failures and keep the generic message.
    }

    throw new Error(detail)
  }

  return response.json()
}

export async function getTrainingHistory(token, range = '90d') {
  const response = await fetch(`${API_BASE_URL}/api/training/history?range=${encodeURIComponent(range)}`, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    let detail = `Training data request failed with status ${response.status}`

    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = payload.detail
      }
    } catch {
      // Ignore JSON parse failures and keep the generic message.
    }

    throw new Error(detail)
  }

  return response.json()
}

export async function importTrainingDataFiles(token, files) {
  const formData = new FormData()
  Array.from(files ?? []).forEach((file) => {
    formData.append('files', file)
  })

  const response = await fetch(`${API_BASE_URL}/api/training/import`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    let detail = `Training import failed with status ${response.status}`

    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
      }
    } catch {
      // ignore
    }

    throw new Error(detail)
  }

  return response.json()
}

export async function importSleepDataFiles(token, files) {
  const formData = new FormData()
  Array.from(files ?? []).forEach((file) => {
    formData.append('files', file)
  })

  const response = await fetch(`${API_BASE_URL}/api/sleep/import`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    let detail = `Sleep import failed with status ${response.status}`

    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
      }
    } catch {
      // ignore
    }

    throw new Error(detail)
  }

  return response.json()
}

export async function getHomeSuggestions(token, lat, lon) {
  const response = await fetch(
    `${API_BASE_URL}/api/suggestions/home?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
    {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!response.ok) {
    let detail = `Suggestions request failed with status ${response.status}`

    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = payload.detail
      }
    } catch {
      // Ignore JSON parse failures and keep the generic message.
    }

    throw new Error(detail)
  }

  return response.json()
}

export async function seedMockIndoorReadings(token, months = 2) {
  const response = await fetch(`${API_BASE_URL}/api/sensor/home/mock-readings`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ months }),
  })

  if (!response.ok) {
    let detail = `Mock seed failed with status ${response.status}`
    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
      }
    } catch {
      // ignore
    }
    throw new Error(detail)
  }

  return response.json()
}

export async function clearMockIndoorReadings(token) {
  const response = await fetch(`${API_BASE_URL}/api/sensor/home/mock-readings`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    let detail = `Clear mock failed with status ${response.status}`
    try {
      const payload = await response.json()
      if (payload?.detail) {
        detail = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
      }
    } catch {
      // ignore
    }
    throw new Error(detail)
  }

  return response.json()
}
