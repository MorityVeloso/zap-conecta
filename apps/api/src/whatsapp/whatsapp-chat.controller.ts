/**
 * WhatsAppChatController — chat operations (typing, delete, edit, block, profile, privacy).
 * All endpoints require tenant auth.
 */
import { Controller, Post, Get, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';
import { EvolutionApiClientService } from './evolution-api-client.service';
import { EvolutionInstanceService } from './evolution-instance.service';
import type {
  SendPresenceDto,
  DeleteMessageDto,
  EditMessageDto,
  BlockContactDto,
  UpdateProfileNameDto,
  UpdateProfileStatusDto,
  UpdateProfilePictureDto,
  PrivacySettingsDto,
  SetPresenceDto,
  DownloadMediaDto,
  HandleLabelDto,
  ArchiveChatDto,
  SendStatusDto,
} from './dto/chat.dto';

@ApiTags('WhatsApp Chat')
@ApiSecurity('x-api-key')
@Controller('whatsapp/chat')
export class WhatsAppChatController {
  constructor(
    private readonly evolutionClient: EvolutionApiClientService,
    private readonly evolutionInstanceService: EvolutionInstanceService,
  ) {}

  private async resolveInstance(tenantSlug: string): Promise<string> {
    const inst = await this.evolutionInstanceService.findByTenant(tenantSlug);
    if (!inst?.instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);
    return inst.instanceName;
  }

  @Post('typing')
  @ApiOperation({ summary: 'Send typing/recording/paused presence' })
  @ApiResponse({ status: 200, description: 'Presence sent' })
  async sendTyping(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendPresenceDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.sendPresence(instanceName, dto.phone, dto.presence, dto.delay);
    return { success: true };
  }

  @Post('delete-message')
  @ApiOperation({ summary: 'Delete a message for everyone' })
  @ApiResponse({ status: 200, description: 'Message deleted' })
  async deleteMessage(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: DeleteMessageDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.deleteMessage(instanceName, dto.messageId, dto.remoteJid, dto.fromMe);
    return { success: true };
  }

  @Post('edit-message')
  @ApiOperation({ summary: 'Edit a sent message' })
  @ApiResponse({ status: 200, description: 'Message edited' })
  async editMessage(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: EditMessageDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.editMessage(instanceName, dto.messageId, dto.remoteJid, dto.fromMe, dto.text);
    return { success: true };
  }

  @Post('block')
  @ApiOperation({ summary: 'Block a contact' })
  @ApiResponse({ status: 200, description: 'Contact blocked' })
  async block(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: BlockContactDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.blockContact(instanceName, dto.phone);
    return { success: true };
  }

  @Post('unblock')
  @ApiOperation({ summary: 'Unblock a contact' })
  @ApiResponse({ status: 200, description: 'Contact unblocked' })
  async unblock(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: BlockContactDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.unblockContact(instanceName, dto.phone);
    return { success: true };
  }

  @Get('profile/:phone')
  @ApiOperation({ summary: 'Get contact profile info' })
  @ApiParam({ name: 'phone', type: 'string' })
  @ApiResponse({ status: 200, description: 'Profile info returned' })
  async getProfile(
    @CurrentTenant() tenant: TenantContext,
    @Param('phone') phone: string,
  ): Promise<Record<string, unknown>> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.fetchProfile(instanceName, phone);
  }

  @Post('profile/name')
  @ApiOperation({ summary: 'Update own profile name' })
  @ApiResponse({ status: 200, description: 'Name updated' })
  async updateProfileName(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateProfileNameDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.updateProfileName(instanceName, dto.name);
    return { success: true };
  }

  @Post('profile/status')
  @ApiOperation({ summary: 'Update own profile status text' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateProfileStatus(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateProfileStatusDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.updateProfileStatus(instanceName, dto.status);
    return { success: true };
  }

  @Post('profile/picture')
  @ApiOperation({ summary: 'Update own profile picture' })
  @ApiResponse({ status: 200, description: 'Picture updated' })
  async updateProfilePicture(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateProfilePictureDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.updateProfilePicture(instanceName, dto.picture);
    return { success: true };
  }

  @Get('privacy')
  @ApiOperation({ summary: 'Get privacy settings' })
  @ApiResponse({ status: 200, description: 'Privacy settings returned' })
  async getPrivacy(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Record<string, unknown>> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.fetchPrivacySettings(instanceName);
  }

  @Post('privacy')
  @ApiOperation({ summary: 'Update privacy settings' })
  @ApiResponse({ status: 200, description: 'Privacy settings updated' })
  async updatePrivacy(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PrivacySettingsDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    const settings: Record<string, string> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) settings[key] = value;
    }
    await this.evolutionClient.updatePrivacySettings(instanceName, settings);
    return { success: true };
  }

  @Post('presence')
  @ApiOperation({ summary: 'Set global online/offline presence' })
  @ApiResponse({ status: 200, description: 'Presence set' })
  async setPresence(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SetPresenceDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.setGlobalPresence(instanceName, dto.presence);
    return { success: true };
  }

  @Post('media/download')
  @ApiOperation({ summary: 'Download media from a message as base64' })
  @ApiResponse({ status: 200, description: 'Media downloaded' })
  async downloadMedia(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: DownloadMediaDto,
  ): Promise<{ base64: string; mimetype: string }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.downloadMedia(instanceName, dto.messageId, dto.remoteJid, dto.fromMe);
  }

  // ── Labels ──────────────────────────────────────

  @Get('labels')
  @ApiOperation({ summary: 'List all labels' })
  @ApiResponse({ status: 200, description: 'Labels returned' })
  async getLabels(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Record<string, unknown>[]> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.findLabels(instanceName);
  }

  @Post('labels')
  @ApiOperation({ summary: 'Add or remove a label from a chat' })
  @ApiResponse({ status: 200, description: 'Label updated' })
  async handleLabel(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: HandleLabelDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.handleLabel(instanceName, dto.labelId, dto.chatId, dto.action);
    return { success: true };
  }

  // ── Archive ─────────────────────────────────────

  @Post('archive')
  @ApiOperation({ summary: 'Archive or unarchive a chat' })
  @ApiResponse({ status: 200, description: 'Chat archive status updated' })
  async archiveChat(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: ArchiveChatDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.archiveChat(instanceName, dto.chatId, dto.archive);
    return { success: true };
  }

  // ── Status/Stories ──────────────────────────────

  @Post('status')
  @ApiOperation({ summary: 'Post a status/story (text, image, video, audio)' })
  @ApiResponse({ status: 200, description: 'Status posted' })
  async sendStatus(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SendStatusDto,
  ): Promise<Record<string, unknown>> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.sendStatus(instanceName, dto.type, {
      content: dto.content,
      caption: dto.caption,
      backgroundColor: dto.backgroundColor,
      font: dto.font,
      allContacts: dto.allContacts,
      statusJidList: dto.statusJidList,
    });
  }
}
