// Glicko-1 style rating for daily league bots (Todo.md 10.8).
//
// Each bot has a rating (default 1500) and a rating deviation (RD, the volatility):
//   - new bots start with a high RD, so their first matches move them a lot
//   - each match adds information and shrinks RD
//   - after PROVISIONAL_MATCHES matches the bot is no longer provisional and RD is capped
//     at ESTABLISHED_RD, so its rating stops swinging on single results
//
// A 4-bot match is turned into pairwise results: a bot beats every bot placed below it,
// loses to every bot placed above it, and ties on equal rank (never happens with the
// current placement code, but handled). The Glicko update sums over the other three bots.
//
// The functions here are pure. The daily run uses applyPlacementsToRatings for live
// results and the backfill tool uses the same function, so both give the same numbers.

export const DEFAULT_RATING = 1500
export const DEFAULT_RATING_DEVIATION = 350
export const MIN_RATING_DEVIATION = 60
export const ESTABLISHED_RATING_DEVIATION = 120
export const PROVISIONAL_MATCHES = 10

const Q = Math.LN10 / 400

function g(rd) {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI))
}

function expectedScore(rating, opponentRating, opponentRd) {
  return 1 / (1 + Math.pow(10, (-g(opponentRd) * (rating - opponentRating)) / 400))
}

// Plain Glicko-1 update for one player against a list of opponents.
// opponents: [{ rating, ratingDeviation, score }] with score 1 win, 0.5 tie, 0 loss.
// Returns { rating, ratingDeviation } without any clamping.
export function glickoUpdate({ rating, ratingDeviation }, opponents) {
  let sumDelta = 0
  let precision = 0
  for (const opponent of opponents) {
    const gj = g(opponent.ratingDeviation)
    const e = expectedScore(rating, opponent.rating, opponent.ratingDeviation)
    sumDelta += gj * (opponent.score - e)
    precision += Q * Q * gj * gj * e * (1 - e)
  }
  const newVariance = 1 / (1 / (ratingDeviation * ratingDeviation) + precision)
  return {
    rating: rating + Q * newVariance * sumDelta,
    ratingDeviation: Math.sqrt(newVariance),
  }
}

export function defaultRatingState() {
  return {
    rating: DEFAULT_RATING,
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    ratingMatches: 0,
  }
}

// Sanitizes stored rating fields. Missing or invalid values fall back to the defaults.
export function ratingStateFromRecord(record) {
  const source = record && typeof record === 'object' ? record : {}
  const fallback = defaultRatingState()
  return {
    rating: Number.isFinite(source.rating) ? source.rating : fallback.rating,
    ratingDeviation: Number.isFinite(source.ratingDeviation) && source.ratingDeviation > 0
      ? source.ratingDeviation
      : fallback.ratingDeviation,
    ratingMatches: Number.isInteger(source.ratingMatches) && source.ratingMatches >= 0 ? source.ratingMatches : 0,
  }
}

export function isProvisional(state) {
  return state.ratingMatches < PROVISIONAL_MATCHES
}

// Fields a bot record carries for the rating. `provisional` is derived, not stored.
export function ratingFields(record) {
  const state = ratingStateFromRecord(record)
  return {
    rating: state.rating,
    ratingDeviation: state.ratingDeviation,
    ratingMatches: state.ratingMatches,
    provisional: isProvisional(state),
  }
}

// placements: [{ botId, rank }] for one match, rank 1 is best.
// states: Map botId -> rating state (missing bots start from the defaults).
// Returns a new Map with the updated state of every bot in the match. Ratings are taken
// from before the match, so the order of bots in the placements list does not matter.
export function applyPlacementsToRatings(states, placements) {
  const before = placements.map((placement) => ratingStateFromRecord(states.get(placement.botId)))
  const next = new Map(states)

  placements.forEach((placement, index) => {
    const self = before[index]
    const opponents = []
    placements.forEach((other, otherIndex) => {
      if (otherIndex === index) return
      const otherState = before[otherIndex]
      const score = placement.rank < other.rank ? 1 : placement.rank > other.rank ? 0 : 0.5
      opponents.push({
        rating: otherState.rating,
        ratingDeviation: otherState.ratingDeviation,
        score,
      })
    })

    const updated = glickoUpdate(self, opponents)
    const ratingMatches = self.ratingMatches + 1
    let ratingDeviation = Math.max(MIN_RATING_DEVIATION, updated.ratingDeviation)
    if (ratingMatches >= PROVISIONAL_MATCHES) {
      ratingDeviation = Math.min(ratingDeviation, ESTABLISHED_RATING_DEVIATION)
    }

    next.set(placement.botId, {
      rating: updated.rating,
      ratingDeviation,
      ratingMatches,
    })
  })

  return next
}

// Applies matches in order. Each match is { participants: [{slot, displayName}], result: { placements: [{slot, rank}] } }.
// Returns Map displayName -> rating state.
export function applyMatchesToRatings(matches, startingStates = new Map()) {
  let states = new Map(startingStates)
  for (const match of matches) {
    const participantBySlot = new Map((match.participants ?? []).map((participant) => [participant.slot, participant]))
    const placements = []
    for (const placement of match.result?.placements ?? []) {
      const participant = participantBySlot.get(placement.slot)
      if (!participant) continue
      placements.push({ botId: participant.displayName, rank: placement.rank })
    }
    if (placements.length >= 2) {
      states = applyPlacementsToRatings(states, placements)
    }
  }
  return states
}
