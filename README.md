# Samsung Smart TV IPTV Application (172.20.5.50)

A high-performance IPTV web application designed specifically for **Samsung Smart TV (Tizen OS)** to watch live TV channels from `http://172.20.5.50/`.

---

## 🌟 Features

- **Live channel list**: the app shows its saved list instantly, then refreshes from the IPTV server in the background (no reinstall needed when channels change). The bundled `channels.js` (92 channels) is the offline fallback.
  - 🇧🇩 **Bangla**: ATN Bangla, Channel i, Maasranga, Nagorik, Duranta, etc.
  - 📰 **News**: Somoy TV, Jamuna TV, Channel 24, ATN News, Independent TV, BBC News, Al Jazeera, Geo News.
  - 🏏 **Sports (18 Channels)**: A Sports HD, T Sports, Sony Sports Ten 1/2/3/5, Star Sports 1/2/Hindi/Select, Eurosport, etc.
  - 🎬 **English (27 Channels)**: HBO, WB, Star Movies, AXN, Animal Planet, Discovery, BBC News, Al Jazeera, etc.
  - 🇮🇳 **Hindi (16 Channels)**: Zee Cinema, Sony Max, Star Gold, Colors, &Pictures, Star Plus, etc.
  - 👶 **Kids (10 Channels)**: Cartoon Network, Nickelodeon, Disney Channel, Bal Bharat, etc.
  - 🕌 **Islamic (2 Channels)**: Peace TV Bangla, Madani TV.
- **Stable channel numbers**: a channel keeps its number even when the server adds or removes channels.
- **Native Samsung Playback**: Streams play through Samsung's hardware AVPlay player on the TV (hls.js in browsers), with a loading screen, buffering indicator, automatic reconnect, and a "Channel unavailable" screen when a stream is down.
- **Favorites & Resume**: Star channels into a ★ Favorites tab, and the app reopens on the last channel you watched (both saved on the TV).
- **10-Foot Leanback TV UI**: Designed for living room TV screens (1080p / 4K) with glowing D-Pad focus navigation.
- **Full TV Remote Control Support**:
  - D-Pad navigation (`▲`, `▼`, `◀`, `▶`, `OK`).
  - Direct Channel Number Jumping (`0` - `9`).
  - Return / Back: player → grid → category bar → "Exit?" confirmation.
  - Channel Up / Down (and ◀ ▶ while watching) stay inside the category you are browsing, e.g. Favorites.
  - Volume and mute are left to the TV, so its own volume display works as usual.
- **On-Screen Display (OSD)**:
  - Channel name, number, logo, live badge, and clock.
  - **Quick Channel Drawer**: Browse other channels while watching live TV!
  - Auto-hides after 4.5 seconds of inactivity.
- **Dual Compatibility**:
  - Can be packaged into `SamsungSmartIPTV.wgt` for native installation.
  - Can be accessed instantly from Samsung TV's Web Browser or any smart device on the local network.

---

## 🚀 How to Use & Install on Samsung Smart TV

### Method 1: Instant Access via Samsung TV Browser (No Developer Mode Needed)
1. Ensure your Samsung TV and your Mac are connected to the same Wi-Fi / Local Network.
2. Open the **Internet / Web Browser** app on your Samsung TV.
3. Type the following URL:
   ```text
   http://192.168.0.175/samsung-tv-iptv/
   ```
4. Press **Enter/Go**.
5. (Optional) Press the **Star / Bookmark** button or select **"Add to Home Screen"** on the TV browser for 1-click access anytime!

---

### Method 2: Install as Native App via Tizen Studio / CLI

If you want the app installed on your Samsung TV app drawer alongside Netflix and YouTube:

1. **Enable Developer Mode on Samsung TV**:
   - Turn on Samsung TV.
   - Go to **Apps** screen.
   - On your TV remote, press sequence `1`, `2`, `3`, `4`, `5`.
   - A Developer Mode popup will appear. Turn **Developer Mode ON**.
   - Enter your computer's IP address: `192.168.0.175`.
   - Restart the TV (hold power button on remote for 3 seconds).

2. **Connect to TV from Mac**:
   ```bash
   sdb connect <YOUR_SAMSUNG_TV_IP>
   ```

3. **Build and install the widget**:
   The package must be signed, so always build it with the script (a plain zip will not install):
   ```bash
   ./package_wgt.sh SamsungIPTV          # your Tizen security profile
   tizen install -n SamsungSmartIPTV.wgt -t <TV_DEVICE_NAME>
   ```
   Or run `./complete_tv_install.sh <TV_IP>` to build, install and launch in one go.

---

## 🎮 Remote Control Shortcuts

| Remote Button | Action |
| --- | --- |
| **Arrow Up / Down / Left / Right** | Move focus across category tabs and channels |
| **OK / Enter** | Play selected channel / open the quick channel list while watching (retries when a channel is unavailable) |
| **Return / Back** | Player → channel grid → category bar → exit confirmation |
| **0 – 9 Keys** | Jump directly to channel number (e.g. `8` `2` for Channel 82; switches as soon as the number is unambiguous) |
| **Play / Pause / Stop** | Pause, rejoin the live stream, or close the player |
| **Red** (`F` on keyboard) | Add / remove the highlighted or playing channel from the ★ Favorites tab |
| **PRE-CH / Green** (`P` on keyboard) | Jump back to the previous channel (from the grid: resume the last watched channel) |
| **Hold 🎤 mic (Bixby)** | Voice control on the TV — say e.g. "Somoy TV", "Channel 24", "number 12", "Sports", "Favorites", "next channel", "previous channel", "add to favorites", "stop" |
| **Blue** (`V` on keyboard) | Browser-only voice control via the Web Speech API (desktop Chrome / Edge) |
| **Arrow Down (in video)** | Open the quick channel list on the TV (shows player controls in a desktop browser) |
| **In the channel list** | ▲ ▼ browse, ◀ ▶ change category, OK watch, RED favorite, RETURN close |
| **Arrow Left / Right, CH +/− (in video)** | Previous / next channel in the current category |

---

## 📁 Project Structure

- `js/config.js`: Server URL, default category, channel name fixes and News channel list.
- `index.html`: Main TV application layout & player viewport.
- `app.js`: Tizen remote control event listener & navigation engine.
- `style.css`: 10-foot TV UI stylesheet with spatial focus animations.
- `channels.js`: Full 92 channels list extracted from `http://172.20.5.50/`.
- `api.php`: Dynamic IPTV sync and stream token extractor.
- `config.xml`: Official Tizen Web Application manifest.
- `icon.png`: App launcher icon (512x512).
- `js/hls.js`: hls.js 1.5.20 (HLS playback in desktop browsers; the TV uses Samsung AVPlay).
- `package_wgt.sh`: Builds the signed `SamsungSmartIPTV.wgt` from the app files only (build output is git-ignored).

Requires Tizen 3.0 or newer (2017+ Samsung TVs).
