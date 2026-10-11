-- One row each time the app is opened (a page load), for the Insights page.
-- PlanBox has no logins; an app open is the closest thing to a session.
CREATE TABLE core_app_opens (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
) STRICT;

CREATE INDEX core_app_opens_by_time ON core_app_opens (created_at) WHERE deleted_at IS NULL;
