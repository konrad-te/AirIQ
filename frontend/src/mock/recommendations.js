export const ROOM_RECOMMENDATIONS = {
  "nordic-living-room": [
    {
      id: "lr-rec-1",
      priority: "low",
      title: "Keep balanced airflow schedule",
      description: "CO2 rises in the afternoon. Keep the current automation window for cross-ventilation.",
      action: "Review automation profile at 14:00-18:00",
    },
    {
      id: "lr-rec-2",
      priority: "medium",
      title: "Adjust evening humidity by 2%",
      description: "Humidity slowly trends upward after sunset and may reduce comfort overnight.",
      action: "Increase dehumidifier target to 45%",
    },
  ],
  "nordic-bedroom": [
    {
      id: "br-rec-1",
      priority: "high",
      title: "Reduce overnight CO2 accumulation",
      description: "Bedroom CO2 crosses the desired comfort threshold during late hours.",
      action: "Enable night micro-ventilation mode",
    },
    {
      id: "br-rec-2",
      priority: "medium",
      title: "Stabilize humidity near 48%",
      description: "Humidity remains safe but drifts close to the upper comfort band at night.",
      action: "Set extractor fan to low for 30 minutes before sleep",
    },
  ],
  "nordic-studio": [
    {
      id: "st-rec-1",
      priority: "medium",
      title: "Lower peak PM2.5 during work hours",
      description: "Particulate concentration spikes during intensive work sessions in the afternoon.",
      action: "Run purifier in boost mode at 15:00",
    },
    {
      id: "st-rec-2",
      priority: "low",
      title: "Improve desk-zone circulation",
      description: "Temperature is stable, but airflow around the desk zone can be smoother.",
      action: "Reposition fan angle by 12 degrees",
    },
  ],
  "nordic-kitchen": [
    {
      id: "kt-rec-1",
      priority: "medium",
      title: "Capture post-cooking particles earlier",
      description: "PM2.5 remains elevated after meal windows and settles slowly.",
      action: "Start hood 5 minutes before cooking begins",
    },
    {
      id: "kt-rec-2",
      priority: "low",
      title: "Maintain comfortable moisture range",
      description: "Humidity is under control but edges up during dinner preparation.",
      action: "Trigger vent preset when humidity > 50%",
    },
  ],
};

export const DASHBOARD_RECOMMENDATIONS = [
  {
    id: "dash-1",
    priority: "high",
    title: "Bedroom CO2 exceeds nightly target",
    description: "Prioritize overnight airflow to keep sleep conditions stable.",
    roomId: "nordic-bedroom",
  },
  {
    id: "dash-2",
    priority: "medium",
    title: "Kitchen PM2.5 peaks after dinner",
    description: "Run extraction profile earlier to flatten the post-cooking curve.",
    roomId: "nordic-kitchen",
  },
  {
    id: "dash-3",
    priority: "low",
    title: "Living room humidity trending up",
    description: "Minor dehumidification update can keep the comfort margin wider.",
    roomId: "nordic-living-room",
  },
];

export function getRoomRecommendations(roomId) {
  return ROOM_RECOMMENDATIONS[roomId] ?? [];
}

export function getDashboardRecommendations() {
  return DASHBOARD_RECOMMENDATIONS;
}
