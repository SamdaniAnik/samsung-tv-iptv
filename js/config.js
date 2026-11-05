// App settings. Change the IPTV server here (or set localStorage "iptv.serverUrl" to override on one device).
// The server must provide GET /api/channels → [{ id, name, logo, category, url }] (url = signed .m3u8).
window.IPTV_CONFIG = {
  serverUrl: 'http://10.99.99.99',
  // Phone voice remote relay running on the Mac (voice-remote/start.sh). Use the Mac's LAN IP;
  // give the Mac a fixed IP in the router so this keeps working. Empty string turns it off.
  voiceRelayUrl: 'http://192.168.0.175:8765',
  // Words speech recognition hears → how the channel is spelled on the server.
  voiceAliases: {
    shomoy: 'somoy', somoi: 'somoy', jomuna: 'jamuna', ekhon: 'eakhon', akhon: 'eakhon',
    ekattur: 'ekattor', maasranga: 'masranga', baisakhi: 'boisakhi',
    deepto: 'deeptotv', nagarik: 'nagorik', duronto: 'duranta', jalsa: 'jalsha'
  },
  // The app always opens on this category, shown as the first tab.
  defaultCategory: 'Bangla & News',
  // Server categories shown together under one tab.
  categoryMerge: {
    'Bangla': 'Bangla & News',
    'News': 'Bangla & News'
  },
  // Fix names the server spells wrong (applied to bundled and live channel lists).
  nameFixes: {
    'CARTON NETWORK HD': 'CARTOON NETWORK HD',
    'ANT PICTURS HD': 'AND PICTURES HD',
    'EUROSPORTS HD': 'EUROSPORT HD',
    'T-SPORTS-HD': 'T SPORTS HD',
    'PTV-SPORTS-HD': 'PTV SPORTS HD',
    'SONY-SPORTS 5HD': 'SONY SPORTS 5 HD',
    'SONY SPORTS 1HD': 'SONY SPORTS 1 HD',
    'STAR SPORTS-SEL1 HD': 'STAR SPORTS SELECT 1 HD',
    'STAR SPORTS SEL 2 HD': 'STAR SPORTS SELECT 2 HD',
    'STAR SPORTS1 HD': 'STAR SPORTS 1 HD',
    'STAR SPORTS2 HD': 'STAR SPORTS 2 HD',
    'SONY SPORTS2 HD': 'SONY SPORTS 2 HD',
    'STAR-SPORTS 3': 'STAR SPORTS 3',
    'STAR GOLD 2HD': 'STAR GOLD 2 HD'
  }
};
