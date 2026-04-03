import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('App routing', () => {
  it('Landing shows Start Game; click navigates to Workshop', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    const startGame = screen.getByRole('link', { name: /start game/i })
    expect(startGame).toBeInTheDocument()

    fireEvent.click(startGame)

    expect(await screen.findByRole('heading', { name: /workshop/i })).toBeInTheDocument()
  })
})
