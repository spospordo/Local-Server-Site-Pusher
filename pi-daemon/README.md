# Smart Mirror – Remote Management Daemon

This directory contains the **Pi-side daemon** for the
[Local-Server-Site-Pusher](https://github.com/spospordo/Local-Server-Site-Pusher)
remote management integration.  The daemon runs on the Raspberry Pi, polls the
admin server for pending commands, executes them, and reports results back.

---

## Contents

| File | Description |
|---|---|
| `mirror-daemon.js` | The Node.js daemon process |
| `daemon-config.template.json` | Config template – copy to `daemon-config.json` |
| `mirror-daemon.service` | Systemd unit file |
| `install.sh` | One-command installer / updater |

---

## Architecture

```
Admin Server (Local-Server-Site-Pusher)
  └─ POST /admin/api/remote-devices        ← register device, receive token
  └─ POST /admin/api/remote-devices/:id/command  ← queue a command

Raspberry Pi (mirror-daemon.js)
  └─ GET  /api/device/poll                 ← pick up pending commands
  └─ POST /api/device/heartbeat            ← report alive
  └─ POST /api/device/result               ← report command outcome
```

The Pi **polls** the server (default every 30 s).  This means the Pi does not
need an open inbound port – only outbound HTTPS to the admin server is required.

---

## Supported Commands

| Command | Effect |
|---|---|
| `display_on` | Turn HDMI display on (`vcgencmd` → `xrandr` fallback) |
| `display_off` | Turn HDMI display off |
| `browser_restart` | Kill and relaunch the kiosk browser (Chromium) |
| `dashboard_restart` | Alias for `browser_restart` |
| `pi_reboot` | Reboot the Pi (`sudo reboot`) |
| `pi_shutdown` | Shut the Pi down (`sudo shutdown -h now`) |
| `config_update` | Merge key/value pairs into `daemon-config.json` (credentials never overwritten) |
| `daemon_ping` | No-op health check; returns version, uptime, load average |

> **PIR automation**: When `preservePirAutomation` is `true` (the default) the
> daemon logs a notice on `display_off` that local motion-sensing will resume
> control on the next PIR trigger.  The daemon never disables the PIR logic –
> it controls the display only, just like the PIR script does.

---

## Installation

### 1. Register the device in the Admin Dashboard

1. Open the admin dashboard → **Remote Devices**.
2. Click **Register New Device** and give it a name (e.g. `Hallway Mirror`).
3. **Copy the bearer token** – it is shown only once.

### 2. Copy the files to your Pi

```bash
scp -r pi-daemon/ pi@<PI_IP>:~/mirror-daemon/
```

### 3. Run the installer on the Pi

```bash
ssh pi@<PI_IP>
cd ~/mirror-daemon
sudo bash install.sh
```

The installer will:
- Install Node.js ≥ 18 if needed
- Copy files to `/home/pi/mirror-daemon/`
- Create `daemon-config.json` from the template (only on first run)
- Configure `sudoers` for passwordless `reboot`, `shutdown`, and `vcgencmd`
- Install and enable the systemd service

### 4. Set your configuration

```bash
sudo nano /home/pi/mirror-daemon/daemon-config.json
```

Fill in:

```json
{
  "serverUrl": "https://your-admin-server:3000",
  "deviceToken": "<paste token here>",
  "pollIntervalSeconds": 30,
  "heartbeatIntervalSeconds": 60,
  "displayEnv": ":0",
  "browserCommand": "chromium-browser",
  "browserUrl": "http://localhost",
  "preservePirAutomation": true,
  "rejectUnauthorized": true
}
```

> **Security note**: `daemon-config.json` is mode `0600` (readable only by the
> daemon user).  Never commit this file to source control – it contains your
> secret device token.

### 5. Restart the service

```bash
sudo systemctl restart mirror-daemon
sudo systemctl status mirror-daemon
```

---

## Updating

Run the installer again – it will never overwrite your `daemon-config.json`:

```bash
# On the Pi
cd ~/mirror-daemon
sudo bash install.sh
```

Or manually:

```bash
# Copy new mirror-daemon.js from the repo
scp pi-daemon/mirror-daemon.js pi@<PI_IP>:~/mirror-daemon/
ssh pi@<PI_IP> sudo systemctl restart mirror-daemon
```

---

## Token Rotation

If you need to revoke a compromised token:

1. In the admin dashboard → **Remote Devices** → click **Rotate Token**.
2. Copy the new token.
3. On the Pi: `sudo nano /home/pi/mirror-daemon/daemon-config.json`
4. Update `deviceToken` and save.
5. Restart: `sudo systemctl restart mirror-daemon`

---

## Logs

**On the Pi:**

```bash
# Follow live logs via journald
journalctl -u mirror-daemon -f

# Or tail the file log
tail -f /home/pi/mirror-daemon/logs/mirror-daemon.log
```

**On the admin server:** the admin dashboard → **Logs** panel includes all
remote management events tagged `REMOTE_MGMT`.

---

## Integration Testing

### Test 1: Daemon ping

In the admin dashboard → **Remote Devices** → select your device → **Send
Command** → type `daemon_ping` → **Send**.  The command history should show
`completed` within one poll interval with the Pi's uptime and load average.

### Test 2: Display control

Send `display_off` → wait for the next poll → confirm the display turns off.
Send `display_on` → confirm it comes back on.

### Test 3: Config update

Send `config_update` with payload `{"pollIntervalSeconds": 15}`.  The daemon
will merge this into its config; use `daemon_ping` to confirm the new value
takes effect on the next poll.

### Test 4: Browser restart

Send `browser_restart`.  The kiosk browser should close and reopen within a
few seconds.

### Test 5: Heartbeat / online status

If the Pi is running, the admin dashboard should show the device as **online**
(last seen < 5 minutes).  Stopping the daemon (`sudo systemctl stop
mirror-daemon`) should cause it to show **offline** after 5 minutes.

---

## Security Summary

| Concern | Mitigation |
|---|---|
| Token secrecy | Tokens are stored as PBKDF2 hashes on the server; the plain token is shown only once at registration |
| Token scope | Each Pi has its own unique token; compromising one device does not affect others |
| Config confidentiality | `daemon-config.json` is mode `0600`; never committed to VCS |
| Credential preservation | `config_update` merges changes; `deviceToken` and `serverUrl` keys are explicitly protected from remote overwrite |
| Transport security | HTTPS is the expected transport; `rejectUnauthorized: true` by default |
| Command whitelist | Only the eight listed commands can be issued; the daemon rejects unknown command types |
| Least privilege | The daemon runs as the unprivileged `pi` user; only specific `sudo` commands are permitted without a password |
| Audit trail | Every command execution and result is logged on both the Pi (journald + file) and the server (admin logs) |
