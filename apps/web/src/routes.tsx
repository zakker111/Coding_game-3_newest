import React from 'react'
import type { RouteObject } from 'react-router-dom'
import App from './App'
import NotFound from './NotFound'
import { DocsPage } from './pages/DocsPage'
import { LandingPage } from './pages/LandingPage'
import { WorkshopPage } from './pages/WorkshopPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'workshop', element: <WorkshopPage /> },
      { path: 'docs', element: <DocsPage /> },
      { path: 'docs/bot-instructions', element: <DocsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
