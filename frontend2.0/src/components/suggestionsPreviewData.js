/**
 * Optional preview data for UI development only.
 * Do not use this as a runtime fallback for dashboard decision-making.
 */
export const suggestionsPreviewData = [
  {
    id: 'outdoor_activity',
    family: 'outdoor_activity',
    category: 'outdoor_activity',
    priority: 'medium',
    severity: 'caution',
    title: 'Take it a bit easier outdoors',
    short_label: 'Better for light activity',
    primary_reason: 'Air quality is slightly elevated right now. Short walks or light activity are usually fine, but longer or more intense exercise may be less comfortable.',
    secondary_reasons: [],
    reasons: ['PM2.5 elevated', 'UV high', 'Sun protection recommended'],
    advice: null,
    note: 'UV is high right now. Consider sunscreen, sunglasses, and limiting long exposure during peak sun hours.',
    based_on: ['outdoor_pm25', 'outdoor_pm10', 'outdoor_uv_index'],
  },
  {
    id: 'improve_air_without_ventilation',
    family: 'ventilation',
    category: 'ventilation',
    priority: 'high',
    title: 'Improve air without opening windows',
    primary_reason: 'Outdoor air is too polluted for ventilation.',
    secondary_reasons: [
      'Indoor CO2 is elevated, so the room may feel stale.',
    ],
    reasons: [],
    advice: 'Consider using an air purifier or reducing indoor pollution sources.',
    note: 'It is also quite windy outside right now.',
    based_on: ['outdoor_pm25', 'outdoor_pm10', 'indoor_co2_ppm', 'wind_kmh'],
  },
  {
    id: 'ventilate_soon',
    family: 'ventilation',
    category: 'ventilation',
    priority: 'medium',
    title: 'Ventilate soon',
    primary_reason: 'Indoor air is starting to feel stale, and outdoor air is still acceptable for ventilation.',
    secondary_reasons: ['CO2 is slightly elevated.'],
    reasons: [],
    advice: null,
    note: null,
    based_on: ['outdoor_pm25', 'outdoor_pm10', 'indoor_co2_ppm'],
  },
]
