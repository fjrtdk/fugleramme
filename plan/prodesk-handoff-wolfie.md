# prodesk handoff — for Wolfie

Notes from a Fugleramme deployment investigation. Context and full plan in
`plan/self-hosted-supabase-prodesk.md`.

Host: `fjrt@prodesk` — x86_64 Linux, Docker 29.8.1, 4 CPU, 25 GiB RAM
(18 GiB available), 606 G free disk. Runs seaweedfs, omniroute, karakeep
(web/meilisearch/chrome), drawio. **No Fugleramme present.**

> **Two copies of the source now exist on prodesk — consolidate to one.**
> `~/fugleramme-selfhosted` (190 MB) is a **tarball extract with no `.git`** —
> no history, no branch, no remote. `~/ff-clone-test` (1.5 GB) is a **real git
> clone** at `main`, HEAD `d37b0a1`. The plan calls for a proper clone on a
> `selfhosted-supabase` branch, so keep the git clone and discard the tarball
> extract. A full clone is 1.5 GB because of binary assets in history; a
> shallow clone (`--depth 1`) is 381 MB and is plenty for a deployment target.

---

## 1. ~~BLOCKING~~ RESOLVED — git clone from GitHub now works

> **Status: fixed.** A WAN MSS clamp was applied on prodesk. `git clone` now
> completes in **6m51s**, 1.5 GB, exit 0, HEAD `d37b0a1`. No further action needed.
> The iMac recovered on its own and clones in **1m06s** (381 MB shallow).
> Diagnosis below is kept for reference in case it recurs.

`git clone https://github.com/fjrtdk/fugleramme.git` used to die partway
through the pack transfer:

```
error: 32878 bytes of body are still expected
fetch-pack: unexpected disconnect while reading sideband packet
fatal: early EOF
fatal: fetch-pack: invalid index-pack output
```

**What was already ruled out:**

| Check | Result |
|---|---|
| Repo visibility | **public** — GitHub API returns `"private": false`, so not an auth issue |
| DNS / basic reachability | fine — `curl https://github.com` → HTTP 200 in 0.56 s |
| git protocol itself | fine — `git ls-remote … HEAD` returns `d37b0a1…`, exit 0 |
| HTTP/2 | not the cause — reproduced with `git -c http.version=HTTP/1.1` |
| Shallow clone | not the cause — reproduced with `--depth 1` |
| Proxy env vars | none set on the host |
| Disk space | 606 G free |

**Assessment (confirmed):** small control-plane requests succeeded; large
bodies were cut. Bandwidth measured **113 KB/s** before the fix, **3.6 MB/s**
after — a ~32× improvement. The MSS clamp was the correct diagnosis: a PMTU
black-hole that stalled large transfers, which git surfaces as an early EOF.

**Note:** this affected the iMac identically (same errors, `curl 56 Recv
failure: Connection reset by peer`), because both hosts share a gateway. The
iMac recovered without any local change, which suggests the upstream condition
also cleared. Worth watching for recurrence.

**If it returns, cheapest first:**

1. Check the WAN MSS clamp is still applied and survived reboots.
2. `git clone git@github.com:fjrtdk/fugleramme.git` — SSH transport avoids
   whatever mangles HTTPS bodies.
3. `curl -L -o f.tar.gz https://codeload.github.com/fjrtdk/fugleramme/tar.gz/refs/heads/main`
   as a fallback — slower to detect a stall, but it works.

---

## 2. Cloudflare — needs a dashboard action (not scriptable)

cloudflared runs as a **remotely-managed** tunnel:

```
/home/fjrt/.local/bin/cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/token
```

There is **no `config.yml` on the host** (`/etc/cloudflared/config.yml` and
`~/.cloudflared/config.yml` both absent), so hostname→service rules live in the
**Cloudflare Zero Trust dashboard** and cannot be added from the CLI here.

**What's needed:** a public hostname `birds.rebel.army` → `http://localhost:8090`.

**Constraint:** must not disturb the existing `lab.rebel.army` homelab routes.

Cloudflare Tunnel passes WebSockets natively, so no extra configuration is
needed for `/ws/audio` and `/ws/detections`.

---

## 3. Port allocation

| Port | Status |
|---|---|
| 8080 | **taken** — drawio |
| 8081 | **taken** — seaweedfs |
| 8090 | free — **use this for Fugleramme** |
| 9080, 8099, 9090 | free — spares |

The self-hosted Supabase (postgres / gotrue / postgrest) will need three more.
Those should bind to `127.0.0.1` only — nothing but the reverse proxy should
reach them.

Note prodesk already runs Postgres on `127.0.0.1:5432` for another stack; the
Supabase instance needs its own port and volume.

---

## 4. Confirmed working — no action needed

- **`npm.verdent.app` is reachable** — returns HTTP 404 at the root, which is
  the expected response for a bare npm registry. prodesk can reach VerdENT's
  private registry, so the Docker frontend build (`npm ci` needing
  `@verdent/auth-js@0.1.9`) will not fail on network. This was the main
  build-blocking risk and it is cleared.
- **Resources are ample** for a trimmed Supabase (Postgres + GoTrue + PostgREST)
  plus BirdNET inference.
- **No Fugleramme on prodesk**, so deploying here cannot affect the
  VerdENT-hosted app.
