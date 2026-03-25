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
