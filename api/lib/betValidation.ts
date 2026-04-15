/**
 * Pure validation for bet option arrays. Used by both the bet creation
 * route (server-side source of truth) and the bet creation form
 * (client-side preflight so users see errors without a round trip).
 *
 * Mirror lives at `mobile/lib/betValidation.ts` and must stay in sync.
 */

export type ValidateOptionsResult =
  | { ok: true; normalized: string[] }
  | { ok: false; error: string };

export interface ValidateOptionsOpts {
  /**
   * If set, the array must contain exactly this many options. Used to
   * enforce the 1:1-binary constraint (exactly 2 options in private
   * circles).
   */
  requireExactly?: number;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;
const MAX_LABEL_LENGTH = 50;

export function validateOptionsArray(
  options: unknown,
  opts: ValidateOptionsOpts = {}
): ValidateOptionsResult {
  if (!Array.isArray(options)) {
    return { ok: false, error: "Options must be an array" };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of options) {
    if (typeof raw !== "string") {
      return { ok: false, error: "Each option must be a string" };
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: "Option labels cannot be empty" };
    }
    if (trimmed.length > MAX_LABEL_LENGTH) {
      return {
        ok: false,
        error: `Option labels cannot exceed ${MAX_LABEL_LENGTH} characters`,
      };
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate option: "${trimmed}"` };
    }
    seen.add(key);
    normalized.push(trimmed);
  }

  if (normalized.length < MIN_OPTIONS) {
    return { ok: false, error: `At least ${MIN_OPTIONS} options are required` };
  }
  if (normalized.length > MAX_OPTIONS) {
    return { ok: false, error: `At most ${MAX_OPTIONS} options are allowed` };
  }
  if (opts.requireExactly !== undefined && normalized.length !== opts.requireExactly) {
    return {
      ok: false,
      error: `This bet type requires exactly ${opts.requireExactly} options`,
    };
  }

  return { ok: true, normalized };
}
