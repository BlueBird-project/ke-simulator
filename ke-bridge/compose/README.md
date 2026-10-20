# Phase 6 — full KE stack

Brings up the complete Knowledge-Engine path for the simulator:

```
browser → ke-simulator (nginx) → /bridge → ke-bridge → KE (ke-service) ⇄ fm-standin
```

| Service | Image / build | Port | Role |
|---------|---------------|------|------|
| `ke-service` | `ghcr.io/tno/knowledge-engine/smart-connector:1.5.0` | 8280 | KE Smart Connector |
| `ke-bridge` | build `ke-bridge/Dockerfile` | 8090 | simulator's KB (ASK/POST) |
| `fm-standin` | build `ke-bridge/standin/Dockerfile` | — | temporary FM KB (ANSWER) |
| `ke-simulator` | build root `Dockerfile` (`VITE_USE_KE=true`, `NGINX_CONF=nginx.ke.conf`) | 8081→80 | React frontend |

## Run
```bash
# from ke-bridge/compose/
docker compose up --build
```
Open http://localhost:8081 — the Trading Manager badge should read
**"KE bridge: ke"** once registration completes. Press *Simulate day-ahead
shortfall*: the FM step is answered by the stand-in through the KE.

## Private ke_client
`ke-bridge` and `fm-standin` install `ke_client` from
`git+https://github.com/BlueBird-project/ke-pyclient.git@v0.32.3`. If the repo
requires authentication, export a token and pass it as a build secret/arg, e.g.
set `PIP_EXTRA_INDEX_URL` or use a Git credential — mirror how `trading-manager`
installs it in your environment.

## Degraded mode (FR-7, task T060)
If `ke-service` is down or `ke_client` can't be installed, `ke-bridge` reports
`mode: "simulated"`, the badge shows **"simulated"**, and the frontend falls
back to ENTSO-E/mock. The demo still runs.

## Prices: no TM in this stack
This standalone stack has **no** Trading Manager, so there is no `tou-price`
producer; day-ahead prices fall back to ENTSO-E/mock while the **FM path is real**
via the stand-in. To exercise real TM prices, run against the TM stack instead:

1. Start the `trading-manager` stack (creates the external `local_tm-net`).
2. Point the bridge at TM's connector and drop the FM stand-in only if FM is real:
   - set `KE_REST_ENDPOINT=http://tm-ke-service:8280/rest/` on `ke-bridge`,
   - attach `ke-bridge` / `ke-simulator` to the external network:
     ```yaml
     networks:
       ke-net:
         external: true
         name: local_tm-net
     ```
   - remove the local `ke-service` (use TM's `tm-ke-service`).

## Stop
```bash
docker compose down
```
