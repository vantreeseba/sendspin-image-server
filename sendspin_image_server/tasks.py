"""Helpers for fire-and-forget background work.

`asyncio.create_task` only keeps a weak reference to the task it returns, so a
task nobody holds on to can be garbage-collected mid-flight. Failures are
silent too: the exception is only surfaced by asyncio's default handler when
the task object is finalised, which may be long after the fact or never.

`spawn` keeps a strong reference until the task finishes and logs whatever it
raised, so a failed persistence write shows up in the log instead of vanishing.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Coroutine

logger = logging.getLogger(__name__)

# Strong references to in-flight tasks, discarded as each one completes.
_background: set[asyncio.Task[Any]] = set()


def spawn(coro: Coroutine[Any, Any, Any], description: str) -> asyncio.Task[Any]:
    """Run `coro` in the background, logging a failure as `description`."""
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(lambda t: _on_done(t, description))
    return task


def _on_done(task: asyncio.Task[Any], description: str) -> None:
    _background.discard(task)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("Background task failed: %s", description, exc_info=exc)
