# Carrier VVM relay

The web app cannot open an IMAP connection, so this small service does it for
you and exposes the result as JSON at `GET /vvm`.

```bash
cd visualvm/relay
npm install
IMAP_HOST=imap.yourcarrier.net \
IMAP_USER=5551234567 \
IMAP_PASS=your-voicemail-pin \
VVM_TOKEN="$(openssl rand -hex 16)" \
CORS_ORIGIN="http://localhost:3001" \
npm start
```

Then in the app: **Sources → Your carrier number**, paste
`http://<machine-ip>:8787` and the same `VVM_TOKEN`, and hit **Sync now**.

| Variable | Required | Notes |
| --- | --- | --- |
| `IMAP_HOST` | yes | Your carrier's VVM mailbox host |
| `IMAP_USER` | yes | Usually your number |
| `IMAP_PASS` | yes | Usually your voicemail PIN |
| `VVM_TOKEN` | strongly recommended | Required as `Authorization: Bearer …` when set |
| `CORS_ORIGIN` | yes in practice | Comma-separated origins allowed to call the relay |
| `IMAP_PORT` / `IMAP_SECURE` | no | Default `993` / TLS on |
| `IMAP_MAILBOX` | no | Default `INBOX` |
| `VVM_MAX` | no | Messages per sync, default `25` |

## Reality check

- This only works where your carrier actually runs **VVM over IMAP** (the OMTP
  standard). Many do; some don't, and some expose it only to their own app with
  app-specific credentials.
- Carriers that pack the audio into a proprietary binary body instead of a MIME
  audio part will be skipped — the relay only forwards parts it can identify.
- Keep it on your own network. Do not expose it to the internet without TLS and
  a real token.
- Google Voice is not covered here. Use the Takeout import instead; there is no
  supported API for it.
