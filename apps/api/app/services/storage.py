"""Storage — P0 persistence with a swappable backend.

Design decision: runs live in memory during execution (streaming reads hot
state), then the finished run is persisted as one JSON document. The interface
is deliberately tiny (save/load/list) so a PostgresStorage implementing the
same protocol can replace JSONFileStorage without touching the runner.
SQLite was considered and skipped for P0: a finished storm is a single
immutable document — a document store beats rows until we need cross-run
queries (see docs/architecture.md#storage).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class StorageBackend(Protocol):
    def save_run(self, storm_id: str, payload: dict[str, Any]) -> None: ...
    def load_run(self, storm_id: str) -> dict[str, Any] | None: ...
    def list_runs(self) -> list[str]: ...


class JSONFileStorage:
    """One pretty-printed JSON file per finished storm under data/runs/."""

    def __init__(self, runs_dir: Path):
        self.runs_dir = runs_dir
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, storm_id: str) -> Path:
        safe = "".join(c for c in storm_id if c.isalnum() or c in "-_")
        return self.runs_dir / f"{safe}.json"

    def save_run(self, storm_id: str, payload: dict[str, Any]) -> None:
        try:
            self._path(storm_id).write_text(json.dumps(payload, indent=2, default=str))
        except OSError:  # persistence is best-effort; never kill a live storm over it
            logger.exception("failed to persist run %s", storm_id)

    def load_run(self, storm_id: str) -> dict[str, Any] | None:
        p = self._path(storm_id)
        if not p.exists():
            return None
        try:
            return json.loads(p.read_text())
        except (OSError, json.JSONDecodeError):
            logger.exception("failed to load run %s", storm_id)
            return None

    def list_runs(self) -> list[str]:
        return sorted(p.stem for p in self.runs_dir.glob("*.json"))
