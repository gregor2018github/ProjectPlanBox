"""The rules of a page's content: what a page may hold and its plain text.

A page is ``{"boxes": [...], "drawings": [...]}``; each box sits at ``x``/``y``
(pixels from the page's top left), is ``width`` pixels wide and holds a
rich-text document in Tiptap's (ProseMirror's) JSON. Each drawing sits at
``x``/``y`` too and holds pen strokes. The shape of both is checked by the
schema; this module checks the documents (only the node and mark types the
editor knows, image sources that point at this app's own images, and link
targets that can never run script) and that every stroke has whole points.
The twin is ``frontend/src/modules/knowledge/pageText.ts`` and the device service.
"""

import json
import re
from collections.abc import Mapping, Sequence
from typing import cast

from planbox.core.errors import ValidationFailed

MAX_CONTENT = 2_000_000
MAX_DEPTH = 64
NODE_TYPES = frozenset(
    {
        "doc",
        "paragraph",
        "text",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "taskList",
        "taskItem",
        "blockquote",
        "codeBlock",
        "hardBreak",
        "horizontalRule",
        "image",
        "table",
        "tableRow",
        "tableHeader",
        "tableCell",
    }
)
MARK_TYPES = frozenset(
    {
        "bold",
        "italic",
        "underline",
        "strike",
        "code",
        "link",
        "highlight",
    }
)
# Blocks whose inline content forms one line of the plain text.
TEXT_BLOCKS = frozenset({"paragraph", "heading", "codeBlock"})
_IMAGE_SRC = re.compile(r"/api/knowledge/images/[0-9a-f-]{36}\.(?:png|jpg|gif|webp)")
_HREF = re.compile(r"(?:https?://|mailto:)\S+", re.IGNORECASE)


def empty_content() -> dict[str, object]:
    """A page without boxes or drawings."""
    return {"boxes": [], "drawings": []}


def serialize(content: Mapping[str, object]) -> str:
    """The stored form: compact JSON, as the device writes it.

    Raises:
        ValidationFailed: If the page is too large.
    """
    text = json.dumps(content, separators=(",", ":"), ensure_ascii=False)
    if len(text) > MAX_CONTENT:
        raise ValidationFailed("A page holds at most 2 MB of text.")
    return text


def check_content(content: Mapping[str, object]) -> None:
    """Checks every box's document and every drawing's strokes (the schema checks the fields).

    Raises:
        ValidationFailed: If box or drawing ids repeat, a document holds
            something the editor does not make (an unknown node, a foreign
            image, a script link), or a drawing has no strokes or a stroke no
            whole point.
    """
    boxes = cast("Sequence[Mapping[str, object]]", content["boxes"])
    ids = [box["id"] for box in boxes]
    if len(set(ids)) != len(ids):
        raise ValidationFailed("Box ids must be unique within a page.")
    for box in boxes:
        doc = box["doc"]
        if not isinstance(doc, dict) or cast("dict[str, object]", doc).get("type") != "doc":
            raise ValidationFailed("Each box holds one document.")
        _check_node(cast("dict[str, object]", doc), 0)
    drawings = cast("Sequence[Mapping[str, object]]", content.get("drawings", []))
    drawing_ids = [drawing["id"] for drawing in drawings]
    if len(set(drawing_ids)) != len(drawing_ids):
        raise ValidationFailed("Drawing ids must be unique within a page.")
    for drawing in drawings:
        strokes = cast("Sequence[Mapping[str, object]]", drawing["strokes"])
        if not strokes:
            raise ValidationFailed("A drawing holds at least one stroke.")
        for stroke in strokes:
            points = cast("Sequence[int]", stroke["points"])
            if not points or len(points) % 2 != 0:
                raise ValidationFailed("A stroke's points come in x, y pairs.")


def _check_node(node: object, depth: int) -> None:
    if depth > MAX_DEPTH:
        raise ValidationFailed("A box's document is nested too deeply.")
    if not isinstance(node, dict):
        raise ValidationFailed("Document nodes must be objects.")
    fields = cast("dict[str, object]", node)
    kind = fields.get("type")
    if not isinstance(kind, str) or kind not in NODE_TYPES:
        raise ValidationFailed(f"Unknown document node: {kind}.")
    attrs = fields.get("attrs")
    if kind == "image" and not _matches(_IMAGE_SRC, _attr(attrs, "src")):
        raise ValidationFailed("Images must be uploaded to PlanBox.")
    if kind == "text" and not isinstance(fields.get("text"), str):
        raise ValidationFailed("Text nodes need text.")
    marks = fields.get("marks", [])
    if not isinstance(marks, list):
        raise ValidationFailed("Marks must be a list.")
    for mark in cast("list[object]", marks):
        mark_kind = cast("dict[str, object]", mark).get("type") if isinstance(mark, dict) else None
        if not isinstance(mark_kind, str) or mark_kind not in MARK_TYPES:
            raise ValidationFailed(f"Unknown text mark: {mark_kind}.")
        mark_attrs = cast("dict[str, object]", mark).get("attrs")
        if mark_kind == "link" and not _matches(_HREF, _attr(mark_attrs, "href")):
            raise ValidationFailed("Links need an http(s) or mailto address.")
    children = fields.get("content", [])
    if not isinstance(children, list):
        raise ValidationFailed("Node content must be a list.")
    for child in cast("list[object]", children):
        _check_node(child, depth + 1)


def _attr(attrs: object, name: str) -> object:
    return cast("dict[str, object]", attrs).get(name) if isinstance(attrs, dict) else None


def _matches(pattern: re.Pattern[str], value: object) -> bool:
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def page_text(content: Mapping[str, object]) -> str:
    """The page's plain text, for search and previews.

    Each paragraph, heading or code block is one line; a box's lines are
    joined by newlines, and boxes (empty ones skipped) by one more.
    """
    texts: list[str] = []
    for box in cast("Sequence[Mapping[str, object]]", content["boxes"]):
        lines: list[str] = []
        _collect(box["doc"], lines, None)
        text = "\n".join(lines)
        if text:
            texts.append(text)
    return "\n".join(texts)


def _collect(node: object, lines: list[str], line: list[str] | None) -> None:
    fields = cast("dict[str, object]", node)
    kind = fields.get("type")
    if kind == "text":
        if line is not None:
            line.append(str(fields.get("text", "")))
        return
    if kind == "hardBreak":
        if line is not None:
            line.append("\n")
        return
    children = cast("list[object]", fields.get("content", []))
    if kind in TEXT_BLOCKS:
        parts: list[str] = []
        for child in children:
            _collect(child, lines, parts)
        lines.append("".join(parts))
        return
    for child in children:
        _collect(child, lines, line)
