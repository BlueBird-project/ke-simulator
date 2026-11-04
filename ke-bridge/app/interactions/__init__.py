"""Knowledge Interaction holders are collected here and included in the client."""

from . import trading_manager, flexibility_manager, price_forecast


def holders():
    """All KIHolders to register with the KE client."""
    return [trading_manager.tm_ki, flexibility_manager.fm_ki, price_forecast.forecast_ki]
