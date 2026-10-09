"""Composition root for feature modules.

This is the only place that lists modules. Adding a module means adding one
entry here and touching no other module.
"""

from planbox.core.module import Module
from planbox.modules.calendar import module as calendar
from planbox.modules.todos import module as todos

ENABLED_MODULES: tuple[Module, ...] = (todos, calendar)
