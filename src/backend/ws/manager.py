"""In-process WebSocket connection manager for the detection downstream channel.

Tracks per-user connections so detection events can be pushed to all open
/ws/detections tabs belonging to the same authenticated user.
"""

from collections import defaultdict
from fastapi import WebSocket


class _ConnectionManager:
    def __init__(self) -> None:
        self._conns: dict[str, list[WebSocket]] = defaultdict(list)

    def register(self, user_id: str, ws: WebSocket) -> None:
        self._conns[user_id].append(ws)

    def unregister(self, user_id: str, ws: WebSocket) -> None:
        conns = self._conns.get(user_id, [])
        try:
            conns.remove(ws)
        except ValueError:
            pass
        if not conns:
            self._conns.pop(user_id, None)

    async def broadcast(self, user_id: str, payload: dict) -> None:
        """Push payload to every open /ws/detections connection for user_id."""
        conns = list(self._conns.get(user_id, []))
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister(user_id, ws)


# Module-level singleton shared by the audio and detections_ws modules.
manager = _ConnectionManager()
