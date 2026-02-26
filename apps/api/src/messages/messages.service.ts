import { Injectable, Logger } from '@nestjs/common';
import { Direction, MessageStatus, MessageType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export interface SaveMessageDto {
  phone: string;
  type: string; // 'text' | 'image' | 'document' | 'pix' | 'template' | etc.
  content: Record<string, unknown>;
  externalId?: string;
  status?: string;
}

export interface MessageFilters {
  phone?: string;
  direction?: 'INBOUND' | 'OUTBOUND';
  type?: string;
  period?: string; // 'YYYY-MM'
  page?: number;
  limit?: number;
}

export interface ConversationSummary {
  phone: string;
  lastMessage: string;
  lastDirection: string;
  lastAt: Date;
  lastStatus: string;
}

export interface MessagePage {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists an outbound message (after send* call succeeds).
   * Best-effort: errors are logged but not rethrown.
   */
  async saveOutbound(
    tenantId: string,
    instanceId: string,
    dto: SaveMessageDto,
  ): Promise<void> {
    try {
      await this.prisma.message.create({
        data: {
          tenantId,
          instanceId,
          phone: dto.phone,
          direction: Direction.OUTBOUND,
          type: (dto.type.toUpperCase() as MessageType) ?? MessageType.TEXT,
          content: dto.content as Prisma.InputJsonValue,
          externalId: dto.externalId,
          status: (dto.status?.toUpperCase() as MessageStatus) ?? MessageStatus.SENT,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to save outbound message: ${String(err)}`);
    }
  }

  /**
   * Persists an inbound message received via webhook.
   * Best-effort: errors are logged but not rethrown.
   */
  async saveInbound(
    tenantId: string,
    instanceId: string,
    dto: SaveMessageDto,
  ): Promise<void> {
    try {
      await this.prisma.message.create({
        data: {
          tenantId,
          instanceId,
          phone: dto.phone,
          direction: Direction.INBOUND,
          type: (dto.type.toUpperCase() as MessageType) ?? MessageType.TEXT,
          content: dto.content as Prisma.InputJsonValue,
          externalId: dto.externalId,
          status: MessageStatus.DELIVERED,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to save inbound message: ${String(err)}`);
    }
  }

  /** Lists messages for a tenant with optional filters and pagination. */
  async findByTenant(
    tenantId: string,
    filters: MessageFilters,
  ): Promise<MessagePage> {
    const { phone, direction, type, period, page = 1, limit = 50 } = filters;

    const where: Prisma.MessageWhereInput = { tenantId };
    if (phone) where.phone = phone;
    if (direction) where.direction = direction;
    if (type) where.type = type.toUpperCase() as MessageType;

    if (period) {
      const [year, month] = period.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      where.createdAt = { gte: start, lt: end };
    }

    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          phone: true,
          direction: true,
          type: true,
          content: true,
          status: true,
          externalId: true,
          createdAt: true,
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /** Returns the most recent message per unique phone (conversation list view). */
  async getConversations(tenantId: string): Promise<ConversationSummary[]> {
    // Get latest message per phone using a raw approach:
    // 1. Fetch most recent N messages
    // 2. Group client-side (avoids complex GROUP BY + subquery in Prisma)
    const messages = await this.prisma.message.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 500, // reasonable upper bound for grouping
      select: {
        phone: true,
        content: true,
        direction: true,
        type: true,
        createdAt: true,
        status: true,
      },
    });

    const seen = new Set<string>();
    const conversations: ConversationSummary[] = [];

    for (const msg of messages) {
      if (seen.has(msg.phone)) continue;
      seen.add(msg.phone);

      const content = msg.content as Record<string, unknown>;
      const lastMessage =
        (content.text as string | undefined) ??
        (content.caption as string | undefined) ??
        `[${msg.type.toLowerCase()}]`;

      conversations.push({
        phone: msg.phone,
        lastMessage,
        lastDirection: msg.direction,
        lastAt: msg.createdAt,
        lastStatus: msg.status,
      });
    }

    return conversations;
  }
}
