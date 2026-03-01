import { Navigate } from '@tanstack/react-router'

export function NewInstancePage() {
  return <Navigate to="/dashboard/instances" replace />
}
