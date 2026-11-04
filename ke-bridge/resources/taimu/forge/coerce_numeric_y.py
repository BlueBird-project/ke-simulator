"""Minimal custom forge: coerce the 'y' column to a proper numeric dtype.

Why this exists (real bug found while wiring price-forecast through the KE):
FAST's own `ModelInference.run()` builds the future horizon frame with
`future_df["y"] = None` (plain Python None for every row). Pandas stores that
as an `object` dtype column, not float64. The demo config works around this
by including the `positive_pv` forge, whose `PosValue()` happens to coerce
every value (including None, via its bare `except: return 0`) to a number -
but it ALSO clips real negative prices to 0, which this integration must not
do (electricity day-ahead prices can be legitimately negative).

This forge does the same dtype fix WITHOUT clipping or inventing values:
`pd.to_numeric(..., errors="coerce")` turns None into NaN and leaves real
numbers (including negatives) untouched. Without it, `ChronosTranslate`
fails with `Cannot change data-type for array of references` and
`ModelInference.run()` raises `UnboundLocalError` for the uncaught `forecast`
variable (the real pipeline swallows the inner exception with a bare
`except Exception as e: print(...)`).

Not part of the flexibility-manager repo - mounted into the existing
fast-forecast-api image at /app/api/forge/coerce_numeric_y.py for the
price-forecast config only (see ../price_forecast_api_config.json).
"""

import pandas as pd


class CoerceNumericY:

    name = "coerce_numeric_y"

    def process(self, data: pd.DataFrame, config_process: dict = None):
        data = data.copy()
        data["y"] = pd.to_numeric(data["y"], errors="coerce")
        return data


import dill

forge = CoerceNumericY()

with open("forge_coerce_numeric_y.dill", "wb") as f:
    dill.dump(forge, f)
