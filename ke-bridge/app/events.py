"""Thread-safe SSE event broker.

The KE handler loop runs in a background thread, so publishing must hop onto the
asyncio loop. Subscribers are async generators consumed by the /events route.
"""

import asyncio
from typing import Any, Dict, Set


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: Set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def subscribe(self):
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers.discard(queue)

    def publish_threadsafe(self, event: Dict[str, Any]) -> None:
        """Safe to call from any thread (e.g. the KE handler loop)."""
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._fanout, event)

    def _fanout(self, event: Dict[str, Any]) -> None:
        for queue in list(self._subscribers):
            queue.put_nowait(event)


broker = EventBroker()
