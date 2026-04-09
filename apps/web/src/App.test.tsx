import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'

import appCss from './index.css?raw'
import { routes } from './routes'

it('renders the landing page', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })

  render(<RouterProvider router={router} />)

  expect(screen.getByRole('heading', { name: 'Nowt' })).toBeInTheDocument()
})

it('renders the docs page', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/docs'] })

  render(<RouterProvider router={router} />)

  expect(screen.getByRole('heading', { name: 'Bot instructions' })).toBeInTheDocument()
  expect(screen.getByText(/Quick guide \+ full reference/i)).toBeInTheDocument()
})

it('workshop layout surfaces setup, hides opponent code, and keeps tick events scrollable', () => {
  // 1) Ensure workshop-specific layout rules exist.
  expect(appCss).toMatch(/\.page--workshop\s*\{[\s\S]*max-width:\s*min\(1560px,\s*calc\(100vw - 40px\)\)/)
  expect(appCss).toMatch(/\.workshop-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.7fr\)\s*minmax\(320px,\s*0\.95fr\)/)
  expect(appCss).toMatch(/\.workshop-stage-column,\s*\.workshop-side-column\s*\{[\s\S]*min-width:\s*0/)

  // 2) Render workshop and assert the new UI contract.
  const router = createMemoryRouter(routes, { initialEntries: ['/workshop'] })
  const { container } = render(<RouterProvider router={router} />)

  expect(screen.getByText('Match setup')).toBeInTheDocument()
  expect(screen.getByText('Server sandbox')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Randomize opponents' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Server sandbox mode' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check mirror' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Run mirror' })).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Server URL' })).not.toBeInTheDocument()
  expect(screen.getByText(/runs locally in the browser worker/i)).toBeInTheDocument()
  expect(screen.getAllByRole('option', { name: 'None (inactive)' })).toHaveLength(3)
  expect(screen.getByText(/Opponent slots can be set to None for Workshop-only local inspection/i)).toBeInTheDocument()
  expect(screen.getByText('Tick events')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'All' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Raw' })).toBeDisabled()
  expect(screen.getByRole('textbox', { name: 'Tick events filter' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Copy replay JSON' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Download replay JSON' })).toBeDisabled()
  expect(screen.getByRole('combobox', { name: 'BOT1 selection' })).toBeInTheDocument()
  expect(screen.getByText('Up to 3 local bots.')).toBeInTheDocument()
  expect(screen.getByText('Bot library')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add bot' })).toBeInTheDocument()
  expect(screen.getByText('BOT1 source focus')).toBeInTheDocument()
  expect(screen.getByText('Run a match to map BOT1 pc values back to source lines.')).toBeInTheDocument()
  expect(screen.queryByText('Loadout warning')).not.toBeInTheDocument()
  expect(screen.queryByText('warn')).not.toBeInTheDocument()
  expect(screen.queryByText(/Opponent code is read-only/i)).not.toBeInTheDocument()
  expect(screen.getByText('Slot 1 · BULLET')).toBeInTheDocument()
  expect(container.querySelectorAll('textarea')).toHaveLength(1)

  fireEvent.change(screen.getByRole('combobox', { name: 'Server sandbox mode' }), {
    target: { value: 'remote-http' },
  })
  expect(screen.getByRole('textbox', { name: 'Server URL' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Server username' })).toBeInTheDocument()
  expect(screen.getByLabelText('Server password')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check server' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Run on server' })).toBeInTheDocument()

  // 3) Ensure the tick events <pre> remains a scroll container in the empty state.
  const pre = Array.from(container.querySelectorAll('pre')).find((node) => node.textContent?.includes('Run a match to see events.'))
  expect(pre).toBeTruthy()
  expect(pre?.style.overflow).toBe('auto')

  // 4) Randomize should always repopulate opponent slots with real bots.
  const opponentSelects = ['BOT2 · Opponent', 'BOT3 · Opponent', 'BOT4 · Opponent'].map((label) => {
    const card = screen.getByText(label).closest('section')
    return card?.querySelector<HTMLSelectElement>('select.workshop-select') ?? null
  })
  expect(opponentSelects).toHaveLength(3)
  expect(opponentSelects.every(Boolean)).toBe(true)

  fireEvent.change(opponentSelects[0]!, { target: { value: '__NONE__' } })
  expect(opponentSelects[0]!.value).toBe('__NONE__')

  fireEvent.click(screen.getByRole('button', { name: 'Randomize opponents' }))
  expect(opponentSelects.map((select) => select!.value)).not.toContain('__NONE__')
})
