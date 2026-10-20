"""Knowledge Interaction holders are collected here and included in the client."""

from . import trading_manager, flexibility_manager


def holders():
    """All KIHolders to register with the KE client."""
    return [trading_manager.tm_ki, flexibility_manager.fm_ki]
