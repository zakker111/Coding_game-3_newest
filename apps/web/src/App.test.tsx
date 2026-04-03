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

it('workshop layout: grid can shrink and tick events log is horizontally scrollable', () => {
  // 1) Ensure CSS guards against <pre> min-content width inflating the grid.
  expect(appCss).toMatch(/\.workshop-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  expect(appCss).toMatch(/\.workshop-grid\s*>\s*\.panel\s*\{[\s\S]*min-width:\s*0/)

  // 2) Ensure the tick events <pre> is a scroll container.
  const router = createMemoryRouter(routes, { initialEntries: ['/workshop'] })
  const { container } = render(<RouterProvider router={router} />)

  expect(screen.getByText('Tick events')).toBeInTheDocument()

  const pre = container.querySelector('pre')
  expect(pre).toBeTruthy()
  expect(pre?.style.overflow).toBe('auto')
})
