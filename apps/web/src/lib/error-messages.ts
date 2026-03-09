import { ApiError } from './api'

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Dados inválidos. Verifique e tente novamente.',
  401: 'Sessão expirada. Faça login novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Recurso não encontrado.',
  409: 'Conflito — este recurso já existe.',
  422: 'Dados inválidos. Verifique e tente novamente.',
  429: 'Muitas tentativas. Aguarde um momento.',
  500: 'Erro interno. Tente novamente em alguns instantes.',
  502: 'WhatsApp temporariamente indisponível.',
  503: 'Serviço temporariamente indisponível.',
  504: 'Tempo de resposta esgotado. Tente novamente.',
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Use server message if meaningful, otherwise map from status
    if (error.message && error.message !== 'Erro na requisição') {
      return error.message
    }
    return STATUS_MESSAGES[error.status] ?? 'Erro inesperado. Tente novamente.'
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Erro inesperado. Tente novamente.'
}
