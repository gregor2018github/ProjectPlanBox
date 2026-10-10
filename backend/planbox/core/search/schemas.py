"""HTTP shapes for search."""

from pydantic import BaseModel, Field


class SearchHitOut(BaseModel):
    """One search result."""

    ref: str = Field(description="Entity reference, e.g. 'todos.todo:<id>'.")
    title: str = Field(description="The title; matched terms sit between U+E000 and U+E001.")
    snippet: str = Field(
        description="An excerpt of the text around the match, marked like the title "
        "(empty when the item has no text)."
    )
    hint: str = Field(description="Short context from the owning module, e.g. 'Done · Groceries'.")
