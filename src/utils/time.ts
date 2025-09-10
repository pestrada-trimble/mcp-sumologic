import moment from 'moment';

// Supported units and their moment.js mappings
const UNIT_MAP: Record<string, moment.unitOfTime.DurationConstructor> = {
  s: 'seconds',
  m: 'minutes',
  h: 'hours',
  d: 'days',
  w: 'weeks',
};

const RELATIVE_REGEX = /^-([0-9]+)([smhdw])$/i;

export interface TimeRangeInput {
  from?: string;
  to?: string;
}

export interface TimeRangeResolved {
  from?: string;
  to?: string;
}

/**
 * Parse a single time token which can be:
 *  - An ISO 8601 timestamp (returned unchanged if moment accepts it)
 *  - A relative token in form -15m, -3d, -2h, -30s, -1w
 *  - The string 'now'
 * Returns ISO string or undefined if invalid.
 */
export function parseTimeToken(token: string | undefined, now: moment.Moment): string | undefined {
  if (!token) return undefined;
  if (token.toLowerCase() === 'now') return now.format();

  const match = token.match(RELATIVE_REGEX);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unitKey = match[2].toLowerCase();
    const unit = UNIT_MAP[unitKey];
    if (unit) {
      return moment(now).subtract(amount, unit).format();
    }
  }

  // Try ISO / moment parse
  const parsed = moment(token);
  if (parsed.isValid()) return parsed.format();
  return undefined; // invalid – let caller decide fallback
}

/**
 * Accepts a partial time range possibly containing relative tokens and
 * produces absolute ISO timestamps. If only `from` is a relative token
 * and `to` is missing, `to` becomes now. If only `to` is relative and
 * `from` missing, `from` becomes the same relative value's base (which
 * likely makes range zero) – instead we set `from` to now minus the same
 * delta when only `to` is relative so users can specify a window end.
 * If both resolve and from > to, they are swapped.
 */
export function parseTimeRange(range: TimeRangeInput): TimeRangeResolved {
  const now = moment();
  let { from, to } = range;

  const resolvedFrom = parseTimeToken(from, now);
  const resolvedTo = parseTimeToken(to, now);

  let finalFrom = resolvedFrom;
  let finalTo = resolvedTo;

  // If only from is relative/parsed and to missing => to = now
  if (finalFrom && !to) {
    finalTo = now.format();
  }

  // If only to is provided as relative => treat token as window size ending now
  if (!from && to && to.match(RELATIVE_REGEX) && !resolvedFrom) {
    const match = to.match(RELATIVE_REGEX)!;
    const amount = parseInt(match[1], 10);
    const unit = UNIT_MAP[match[2].toLowerCase()];
    finalTo = now.format();
    finalFrom = moment(now).subtract(amount, unit).format();
  }

  // If after resolution from/to invalid, leave undefined (caller handles defaults)

  if (finalFrom && finalTo && finalFrom > finalTo) {
    // swap to ensure chronological order
    const tmp = finalFrom;
    finalFrom = finalTo;
    finalTo = tmp;
  }

  return { from: finalFrom, to: finalTo };
}
