// ─── Enums ─────────────────────────────────────────────────────────────────

export type TenantStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED'
export type ProfileRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
export type InstanceStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
export type MessageDirection = 'INBOUND' | 'OUTBOUND'
export type MessageType =
  | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO'
  | 'STICKER' | 'LOCATION' | 'CONTACT' | 'BUTTON' | 'LIST' | 'PIX' | 'TEMPLATE'
export type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED'

// ─── Entities ──────────────────────────────────────────────────────────────

export interface Plan {
  id: string
  name: string
  displayName: string
  priceBrlCents: number
  messagesPerMonth: number
  instancesLimit: number
  apiKeysLimit: number
  features: Record<string, unknown>
  isActive: boolean
}

export interface Tenant {
  id: string
  slug: string
  name: string
  planId: string
  plan: Plan
  status: TenantStatus
  createdAt: string
  updatedAt: string
}

export interface Profile {
  id: string
  tenantId: string
  role: ProfileRole
  fullName: string | null
  avatarUrl: string | null
  email: string
  createdAt: string
}

export interface ApiKey {
  id: string
  tenantId: string
  createdById: string
  name: string
  keyPrefix: string // never the full key
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface WhatsAppInstance {
  id: string
  tenantId: string
  tenantSlug: string
  instanceName: string
  status: InstanceStatus
  phone: string | null
  createdAt: string
  updatedAt: string
}

export interface MessageContent {
  text?: string
  imageUrl?: string
  documentUrl?: string
  caption?: string
  fileName?: string
  pixCode?: string
  templateId?: string
  variables?: Record<string, string>
}

export interface Message {
  id: string
  tenantId: string
  instanceId: string
  phone: string
  direction: MessageDirection
  type: MessageType
  content: MessageContent
  status: MessageStatus
  externalId: string | null
  createdAt: string
}

export interface Subscription {
  id: string
  tenantId: string
  planId: string
  plan: Plan
  status: SubscriptionStatus
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export interface UsageRecord {
  tenantId: string
  period: string
  messagesSent: number
  messagesReceived: number
}

export interface Webhook {
  id: string
  tenantId: string
  url: string
  events: WebhookEvent[]
  isActive: boolean
  createdAt: string
}

export type WebhookEvent =
  | 'message.received'
  | 'message.sent'
  | 'message.status'
  | 'instance.connected'
  | 'instance.disconnected'

// ─── API Responses ─────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
  statusCode: number
}

// ─── Request DTOs ──────────────────────────────────────────────────────────

export interface SignupRequestDto {
  fullName: string
  companyName: string
  email: string
  password: string
}

export interface CreateApiKeyRequestDto {
  name: string
  expiresAt?: string
}

export interface CreateApiKeyResponseDto {
  id: string
  name: string
  keyPrefix: string
  key: string // valor plain — exibido apenas uma vez
  createdAt: string
}

export interface CreateWebhookRequestDto {
  url: string
  events: WebhookEvent[]
  secret?: string
}
