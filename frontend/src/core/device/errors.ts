/**
 * Domain errors and their problem documents (RFC 9457), as in
 * `backend/planbox/core/errors.py`: the same statuses and stable codes, so
 * the frontend handles both backends alike.
 */

/** Base class for errors that services raise on purpose. */
export class DomainError extends Error {
  readonly status: number = 400;
  readonly code: string = "bad_request";
  readonly title: string = "Bad request";

  constructor(readonly detail: string) {
    super(detail);
    this.name = new.target.name;
  }
}

/** The addressed entity does not exist (or is deleted). */
export class NotFound extends DomainError {
  override readonly status = 404;
  override readonly code = "not_found";
  override readonly title = "Not found";
}

/** Only the PC running PlanBox may do this. */
export class Forbidden extends DomainError {
  override readonly status = 403;
  override readonly code = "forbidden";
  override readonly title = "Forbidden";
}

/** The request conflicts with the current state. */
export class Conflict extends DomainError {
  override readonly status = 409;
  override readonly code = "conflict";
  override readonly title = "Conflict";
}

/** The request is well-formed but breaks a business rule. */
export class ValidationFailed extends DomainError {
  override readonly status = 422;
  override readonly code = "validation_failed";
  override readonly title = "Validation failed";
}

/** An outside service (Google Drive) failed or could not be reached. */
export class UpstreamFailed extends DomainError {
  override readonly status = 502;
  override readonly code = "upstream_failed";
  override readonly title = "Outside service failed";
}

/** A problem document, as the frontend receives it. */
export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  errors?: { loc: (string | number)[]; msg: string; type: string }[];
}

/** The problem document for a domain error. */
export function problemOf(error: DomainError): ProblemBody {
  return {
    type: "about:blank",
    title: error.title,
    status: error.status,
    detail: error.detail,
    code: error.code,
  };
}

/** Python's `len()` of a string: code points, not UTF-16 units. */
export function textLength(text: string): number {
  let count = text.length;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) count -= 1;
  }
  return count;
}
