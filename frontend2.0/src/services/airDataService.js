const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

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
