# Deploying Kinetix

Kinetix runs as one Docker Compose stack on a single Linux machine. Only the edge (Caddy)
is reachable from outside; the API, worker, web app, Postgres and Redis stay on the private
Compose network. Everything here is free except the domain.

You need:

- A domain (about $10 a year), with DNS you can edit. Cloudflare Registrar sells at cost.
- A Linux machine with Docker that stays on. Pick one of the two paths below.
- Optional keys, added at the end: Resend (email, free tier) and Gemini (AI, free tier).

The machine needs about 4 GB of free RAM and 20 GB of disk to start.

## Quickest: Amazon Lightsail with AWS credits

About 25 minutes, most of it waiting. No card, no domain purchase: the $12 Lightsail
plan (2 GB RAM, static IP included) runs on AWS credits, and DuckDNS gives a free name.

1. **DuckDNS.** At https://www.duckdns.org, sign in with GitHub, type a subdomain (for
   example `kinetix-fahim`) and click **add domain**. Leave the IP for now.
2. **Create the server.** In the AWS console, open **Lightsail**, then **Create instance**:
   - Region: the one your credits are in (for example Ohio, us-east-2)
   - Platform **Linux/Unix**, blueprint **OS Only**, **Ubuntu 24.04 LTS**
   - **Add launch script**, and paste:
     `curl -fsSL https://raw.githubusercontent.com/Analyst47/kinetix/main/scripts/server-bootstrap.sh | bash`
   - Plan: **$12 USD** (2 GB memory). Name it `kinetix`, then **Create instance**.
3. **Static IP.** Open the instance, go to **Networking**, click **Attach static IP**, then
   **Create and attach**. Copy the IP. (It's free while attached; delete it if you delete
   the instance.)
4. **Firewall.** On the same **Networking** tab, under IPv4 firewall, **Add rule**: HTTPS,
   TCP 443. (SSH 22 and HTTP 80 are already there; HTTP is needed for the certificate.)
5. **Point the name.** Back on DuckDNS, paste the static IP next to your subdomain and click
   **update ip**.
6. **Optional keys.** A Gemini key from https://aistudio.google.com/apikey, and a Resend API
   key from https://resend.com (without your own domain, Resend only delivers to the email
   you signed up with, which covers password resets for your own account).
7. **Run setup.** On the instance page, click **Connect using SSH**. When the terminal opens,
   type `sudo kinetix-setup` and answer the questions. It waits if the server is still
   installing (15-20 minutes after creation), and keys you paste stay on the server. Paste
   with the clipboard icon at the bottom right of the terminal.
8. Open `https://kinetix-fahim.duckdns.org/register`, create your account, then turn on
   two-step verification under **Security**.

Day to day: `sudo kinetix status`, `sudo kinetix logs`, `sudo kinetix update`,
`sudo kinetix backup`. Backups run daily at 03:15 UTC into `/opt/kinetix/backups`. Before
your credits or free period end, download a backup (or move to a paid plan), because AWS
closes free-plan resources then.

The rest of this guide covers other hosts (Oracle, a home computer through Cloudflare
Tunnel) and the details behind these steps.

## Choose a path

| | Path A: Oracle Cloud free VM | Path B: Cloudflare Tunnel |
| --- | --- | --- |
| Machine | Oracle Always Free Ampere A1 (2 ARM cores, 12 GB RAM) | Any computer with Docker, including one at home |
| Inbound ports | 80 and 443 open | None. The tunnel dials out |
| HTTPS | Caddy gets certificates from Let's Encrypt | Cloudflare terminates TLS |
| Visitor IPs | From the connection | From Cloudflare's `CF-Connecting-IP`, trusted only from the tunnel container |
| Watch out for | Free-only accounts can have idle instances reclaimed; Oracle's free limits have changed before | The computer must stay on and online |

Both paths use the same images and the same `.env`; only the last step differs.

## 1. Prepare the machine

Install Docker Engine and the Compose plugin (https://docs.docker.com/engine/install/),
then get the code:

```bash
sudo mkdir -p /opt/kinetix && sudo chown "$USER" /opt/kinetix
git clone https://github.com/Analyst47/kinetix.git /opt/kinetix
cd /opt/kinetix
```

On Path A (Oracle): create an Ubuntu instance on the Ampere A1 shape, then open TCP 80 and
443 (and UDP 443 for HTTP/3) in the VCN security list **and** in the instance firewall:

```bash
sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 2. Create `.env`

```bash
sh scripts/setup-env.sh kinetix.yourdomain.com
```

This writes `.env` (readable only by you) with strong random secrets and your domain. It
never overwrites an existing file. Keep `.env` private and backed up: it holds the key that
encrypts two-step verification secrets.

Never paste the values from `.env` into chats, issues or commits.

## 3. Add your keys

Edit `.env` (`nano .env`):

**Email (Resend).** Sign up at https://resend.com, add your domain under Domains, and add
the DNS records it shows (SPF, DKIM and an MX for bounces) at your DNS provider. When the
domain shows as verified, create an API key with "Sending access" only and set:

```
KINETIX_RESEND_API_KEY=re_...
KINETIX_EMAIL_FROM=Kinetix <security@kinetix.yourdomain.com>
```

The "from" address must be on the verified domain.

**AI (bring-your-own-key by default).** You do not need to set any AI key on the server. By
default each user pastes their own Anthropic or Gemini key in the app under **Settings → AI
assistance**; that key is encrypted, held only for their login session, never written to the
database, and billed to their own provider account. This keeps a public deployment from ever
spending the operator's credits on other people.

The server-side keys below are only for the optional **built-in (managed)** provider, which
serves every workspace from the operator's own key. It is off until you set
`KINETIX_AI_MANAGED_ENABLED=true`, so leave it off until billing is in place. When you do run
it, your own **paid Claude API** account (recommended) or Google's free Gemini tier work the
same way. The key is read server-side only — never sent to the browser, logged, or committed —
and there is no silent fallback.

Paid Claude API — create a key at https://console.anthropic.com and set:

```
KINETIX_AI_PROVIDER=anthropic
KINETIX_AI_API_KEY=sk-ant-...        # or export ANTHROPIC_API_KEY instead
KINETIX_AI_MODEL=claude-sonnet-5-5   # or ANTHROPIC_MODEL; omit for the default
```

Requests bill to your Anthropic Console account at usage-based rates. Model, output cap,
retries, and a monthly spend ceiling are all configurable:

```
KINETIX_AI_MAX_OUTPUT_TOKENS=2048        # tokens generated per request
KINETIX_AI_MAX_RETRIES=4                 # backoff retries on 429/500/503/529
KINETIX_AI_MONTHLY_TOKEN_BUDGET=2000000  # optional hard cap per UTC month; omit for none
```

When a budget is set, Kinetix tracks tokens used this month (shown under **Settings → AI
assistance**) and refuses AI calls once the cap is reached until the month rolls over.

Free Gemini tier — get a key at https://aistudio.google.com/apikey and set:

```
KINETIX_AI_PROVIDER=gemini
KINETIX_AI_API_KEY=AIza...
```

On Gemini's free tier, Google may use prompts to improve its products and human reviewers
may read them. Kinetix shows that notice and makes a workspace admin accept it before AI
can be turned on. Set `KINETIX_AI_GEMINI_TIER=paid` only if billing is on for that key.

Either way, each workspace must still turn AI on under **Settings → AI assistance**.

**Demo workspace (optional).** `KINETIX_DEMO=1` loads the OWASP Juice Shop demo with a
shared login pre-filled on the sign-in page. Anyone can change its data, so leave it off
unless you want a public showcase.

## 4a. Start it: Path A (open ports, automatic HTTPS)

Point DNS at the machine: an `A` record for `kinetix.yourdomain.com` to the VM's public IP
(DNS only, not proxied, if you use Cloudflare DNS). Then:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy obtains a certificate on the first request. Open https://kinetix.yourdomain.com.

## 4b. Start it: Path B (Cloudflare Tunnel, no open ports)

1. Add your domain to Cloudflare (free plan).
2. In the Cloudflare dashboard, go to Zero Trust, then Networks, then Tunnels. Create a
   tunnel of type Cloudflared, name it `kinetix`, and copy the token from the install
   command it shows.
3. On the tunnel's Public Hostname tab, add `kinetix.yourdomain.com` with service type
   `HTTP` and URL `edge:80`.
4. In `.env`, set:

   ```
   KINETIX_SITE_ADDRESS=:80
   KINETIX_EDGE_TRUST=cloudflared
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...
   ```

   `:80` is correct here: TLS ends at Cloudflare and the tunnel reaches the edge privately.

5. Start with the tunnel profile:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tunnel up -d --build
   ```

6. In Cloudflare, under SSL/TLS, turn on Always Use HTTPS and HSTS.

Ports 80 and 443 can stay closed in your firewall and router.

## 5. Check it

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps        # all healthy
python3 scripts/smoke.py https://kinetix.yourdomain.com                    # end-to-end
```

The smoke test signs up a throwaway account and workspace, fetches and scans a public
repository, and checks isolation, rate limits and the audit chain. Then create your real
account at `/register`, open Security, and turn on two-step verification.

## Operations

**Updates.**

```bash
cd /opt/kinetix && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Migrations run automatically before the API starts.

**Backups.** `sh scripts/backup.sh` writes a database dump and a storage archive to
`backups/` and keeps 14 days. Run it daily:

```bash
crontab -e
15 3 * * * cd /opt/kinetix && sh scripts/backup.sh >> backups/backup.log 2>&1
```

Copy `backups/` and `.env` somewhere off the machine too. To restore a database dump:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U kinetix -d kinetix --clean --if-exists < backups/db-YYYYMMDDTHHMMSSZ.dump
```

**Logs.** `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api worker edge`

## What the production configuration enforces

- The API refuses to start if its database role could bypass row-level security, or if
  `KINETIX_SECRET_KEY` is weak.
- Session cookies are `Secure`; API docs and the OpenAPI schema aren't served.
- Missing secrets stop `docker compose up` with a message naming the variable.
- Email that can't be delivered is dropped, never logged, because it contains sign-in links.
- Only the edge is published. The API trusts the client address only from the edge.
