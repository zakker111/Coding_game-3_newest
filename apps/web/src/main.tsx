import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { resolveDefaultServerBaseUrl } from './config'
import './index.css'

// Resolve the backend base URL (e.g. same-origin /api proxy on remote previews) before render.
void resolveDefaultServerBaseUrl().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  )
})
