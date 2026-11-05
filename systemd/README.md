# FluentCI API service

`fluentci-api.service` runs the Gleam Node.js XRPC API and its embedded Jetstream
indexer. It expects a built checkout at `/opt/fluentci`, Node.js 24+ at
`/usr/bin/node`, and a dedicated `fluentci` system account.

Prepare the application before starting the service (Bun, Gleam and Pkl are build
tools; they are not needed to run the built API):

```sh
cd /opt/fluentci
bun install --frozen-lockfile --ignore-scripts
cd apps/api
bun run build
```

Install the unit and configuration from the checkout root:

```sh
sudo useradd --system --user-group --home-dir /var/lib/fluentci --shell /usr/sbin/nologin fluentci
sudo install -d -m 0750 /etc/fluentci
sudo install -m 0600 apps/api/.env.example /etc/fluentci/api.env
sudoedit /etc/fluentci/api.env
sudo install -m 0644 systemd/fluentci-api.service /etc/systemd/system/fluentci-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now fluentci-api.service
sudo systemctl status fluentci-api.service
sudo journalctl -u fluentci-api.service -f
```

Set the bucket, public S3 URL and AWS credentials (or use an instance role).
Remove `DATABASE_URL` from the copied example, or set it to
`file:/var/lib/fluentci/registry.sqlite`. Systemd creates that persistent data
directory with ownership assigned to the service account. The checkout and its
dependencies must be readable by `fluentci`; the service does not write there.

The API listens on loopback port 3001 by default; put your HTTPS reverse proxy in
front of it. Startup reports all invalid environment settings before accessing
SQLite or network services. Logs go to journald and failures restart after five
seconds, up to five starts per minute.

For a different checkout location or Node.js path, run
`sudo systemctl edit fluentci-api.service` and override `WorkingDirectory` and
`ExecStart` (clear `ExecStart` before setting its replacement). After deploying
and rebuilding updates, run `sudo systemctl restart fluentci-api.service`.
