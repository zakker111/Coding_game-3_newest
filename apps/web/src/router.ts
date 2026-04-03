import { createBrowserRouter } from 'react-router-dom'
import { routes } from './routes'

const basePath = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes, {
  basename: basePath === '/' ? undefined : basePath,
})
