import React from 'react'
import { render, screen } from '@testing-library/react'
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
  expect(screen.getByRole('button', { name: 'Randomize opponents' })).toBeInTheDocument()
  expect(screen.getByText('Tick events')).toBeInTheDocument()
  expect(screen.queryByText(/Opponent code is read-only/i)).not.toBeInTheDocument()
  expect(screen.getByText('Slot 1 · BULLET')).toBeInTheDocument()
  expect(container.querySelectorAll('textarea')).toHaveLength(1)

  // 3) Ensure the tick events <pre> remains a scroll container in the empty state.
  const pre = Array.from(container.querySelectorAll('pre')).find((node) => node.textContent?.includes('Run a match to see events.'))
  expect(pre).toBeTruthy()
  expect(pre?.style.overflow).toBe('auto')
})
