import type { Replay } from '@coding-game/replay'

export type PlaybackSpeed = 0.5 | 1 | 2 | 6

export type PlaybackState = {
  replay: Replay | null
  tick: number
  playing: boolean
  speed: PlaybackSpeed
}

export type PlaybackAction =
  | { type: 'LOAD_REPLAY'; replay: Replay }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'STEP'; delta: number }
  | { type: 'SET_TICK'; tick: number }
  | { type: 'SET_SPEED'; speed: PlaybackSpeed }
  | { type: 'RESTART' }

export function getTickCap(replay: Replay | null): number {
  return replay?.tickCap ?? 0
}

export function clampTick(tick: number, tickCap: number): number {
  if (!Number.isFinite(tick)) return 0
  return Math.max(0, Math.min(tickCap, Math.trunc(tick)))
}

export const initialPlaybackState: PlaybackState = {
  replay: null,
  tick: 0,
  playing: false,
  speed: 1,
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'LOAD_REPLAY': {
      return {
        replay: action.replay,
        tick: 0,
        playing: false,
        speed: state.speed,
      }
    }

    case 'PLAY': {
      if (!state.replay) return state
      if (state.tick >= state.replay.tickCap) {
        return { ...state, tick: 0, playing: true }
      }
      return { ...state, playing: true }
    }

    case 'PAUSE': {
      return { ...state, playing: false }
    }

    case 'TOGGLE_PLAY': {
      return playbackReducer(state, { type: state.playing ? 'PAUSE' : 'PLAY' })
    }

    case 'SET_SPEED': {
      return { ...state, speed: action.speed }
    }

    case 'RESTART': {
      return { ...state, tick: 0, playing: false }
    }

    case 'SET_TICK': {
      const tickCap = getTickCap(state.replay)
      return { ...state, tick: clampTick(action.tick, tickCap), playing: false }
    }

    case 'STEP': {
      const tickCap = getTickCap(state.replay)
      const nextTick = clampTick(state.tick + action.delta, tickCap)

      // If we hit the end, pause (so the UI stops animating).
      const nextPlaying = nextTick >= tickCap ? false : state.playing

      return { ...state, tick: nextTick, playing: nextPlaying }
    }

    default: {
      // Exhaustiveness check
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _never: never = action
      return state
    }
  }
}
