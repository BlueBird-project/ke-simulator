# FM stand-in (temporary)

A minimal Flexibility Manager **test double** that registers the FM Knowledge
Base (`http://fm.bluebird.com`) with the Knowledge Engine and ANSWERs the
consumption patterns the simulator bridge ASKs (`fm-ts-info-request`, `fm-ts`).

This implements decision **D-Q2** so the simulator can exercise the real KE path
before the production Flexibility Manager gains KE support. It is **not** the
real FM — it returns a plausible synthetic consumption curve (~500 MWh/day).

## Run
Requires the private `ke_client` (see [../requirements.txt](../requirements.txt))
and a reachable KE Smart Connector.

```bash
# from ke-bridge/standin/
pip install -r ../requirements.txt
# point at your KE if not the default tm-ke-service:8280
set KE_REST_ENDPOINT=http://localhost:8280/rest/
python fm_standin.py
```

## Files
- `fm_standin.py` — registers the KB and the two ANSWER handlers.
- `resources/ke_config.yml` — FM KB id + prefixes + include.
- `resources/ki/flexibility-manager.yaml` — the graph patterns (match the bridge/TM).
- `resources/ki_vars.yml` — `${KB_ID}`, `${ISP_UNIT}` (keep `ISP_UNIT` in sync).

## Replace with the real FM
When the Flexibility Manager registers its own KB and the same (or reasoner-
compatible) patterns, stop this stand-in — no change is needed on the simulator
side (task **T034**).
