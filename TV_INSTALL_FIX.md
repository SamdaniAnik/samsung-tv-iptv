# Samsung TV install: no message / silent fail

## What you see

- **Device Manager → Install app**: progress bar, then nothing (no success or error).
- **Terminal** (`tizen install`): `Failed to install Tizen application` with an empty log, or:
  ```text
  install failed[118, -19], reason: Parsing error
  ```

That is **not** a broken IPTV app. A minimal “HelloTest” app fails the same way until certificates are aligned.

## Cause (checked on your Mac)

Your `.wgt` is signed with the **current** `distributor.p12`, but `device-profile.xml` still embeds an **older** distributor certificate. After **Permit to install**, the TV trusts the old profile; the new signature does not match → install fails (often reported as “Parsing error”).

Check anytime:

```bash
./verify_tv_certs.sh
```

## Fix

1. **Refresh Samsung certs** (browser sign-in once):

   ```bash
   npx samsung-tv-cert --duid P7CHYSD5T2LDW
   ```

2. **Copy profile** for the active Tizen profile name:

   ```bash
   cp ~/tizen-studio-data/SamsungCertificate/Tizen/device-profile.xml \
      ~/tizen-studio-data/SamsungCertificate/SamsungIPTV/
   ```

3. **Verify**:

   ```bash
   ./verify_tv_certs.sh
   ```

4. **Permit again** on the TV (required after a new device-profile):

   ```bash
   export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"
   sdb connect 192.168.0.198
   tizen install-permit -s 192.168.0.198:26101
   ```

   Or: Device Manager → right-click TV → **Permit to install applications** → wait until it finishes.

5. **Build and install**:

   ```bash
   ./complete_tv_install.sh 192.168.0.198
   ```

6. On TV: **Apps → Downloaded → Samsung Smart IPTV**.

## Package ID

Use the package ID from your author cert (SHA-1 fingerprint, first 10 chars). After re-issuing certs, run `./verify_tv_certs.sh` and update `config.xml` if the ID changed (currently **`AE6BDAA214.iptv`**).

The manifest must use `xmlns:tizen="http://tizen.org/ns/widgets"` (Samsung TV 5.5) and must not bundle extra files like `.md` from `build-web`. `./package_wgt.sh` packages only the app files (listed in `APP_FILES`) and signs them. (The old template files `js/main.js` / `css/style.css` were never loaded by the app and have been removed.)

## Browser fallback (no Apps icon)

With XAMPP Apache running on the Mac:

`http://192.168.0.175/samsung-tv-iptv/`
