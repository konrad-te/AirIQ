const mockedDashboardAirData = {
  roomName: "Mitt rum",
  statusLabel: "Okej luftkvalitet",
  metrics: {
    pm25: 26,
    co2: 950,
    temp: 22,
    humidity: 63,
  },
  thresholds: {
    pm25: 35,
    co2: 800,
    tempMin: 19,
    tempMax: 24,
    humidityMax: 55,
  },
  history24h: {
    pm25: [18, 20, 19, 21, 24, 26, 28, 27, 25, 24, 25, 26],
    co2: [520, 580, 620, 680, 710, 760, 800, 850, 920, 980, 970, 950],
    temp: [20, 20, 21, 21, 22, 22, 23, 23, 22, 22, 22, 22],
    humidity: [48, 50, 54, 57, 59, 61, 63, 64, 62, 60, 61, 63],
  },
};

export function getDashboardAirData() {
  return Promise.resolve(mockedDashboardAirData);
}
