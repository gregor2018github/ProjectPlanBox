"""Composition root for feature modules.

This is the only place that lists modules. Adding a module means adding one
entry here and touching no other module.
"""

from planbox.core.module import Module

ENABLED_MODULES: tuple[Module, ...] = ()
