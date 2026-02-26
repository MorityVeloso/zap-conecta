import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL ?? '/api'

class ApiClient {
  private async getAuthHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) {
      return { Authorization: `Bearer ${data.session.access_token}` }
    }
    return {}
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const authHeader = await this.getAuthHeader()

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      throw new ApiError(
        error.message ?? 'Erro na requisição',
        response.status,
        error,
      )
    }

    // 204 No Content
    if (response.status === 204) return undefined as T

    return response.json()
  }

  get<T>(path: string) {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body)
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body)
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path)
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const api = new ApiClient()
