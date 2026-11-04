// App settings. Change the IPTV server here (or set localStorage "iptv.serverUrl" to override on one device).
window.IPTV_CONFIG = {
  serverUrl: 'http://172.20.5.50',
  defaultCategory: 'Bangla',
  // Fix names the server spells wrong (applied to bundled and live channel lists).
  nameFixes: {
    'ALJAZEETA HD': 'ALJAZEERA HD',
    'AND PICTURS HD': 'AND PICTURES HD',
    'EUROSPORTS HD': 'EUROSPORT HD'
  },
  // Channels moved into the News category regardless of the server's category.
  newsChannels: [
    'ATN NEWS', 'CHANNEL 24', 'SOMOY TV', 'JAMUNA TV', 'INDEPENDENT TV',
    'BBC NEWS', 'ALJAZEERA HD', 'GEO NEWS HD'
  ]
};
