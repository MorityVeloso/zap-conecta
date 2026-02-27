/**
 * WhatsAppGroupController — group management endpoints.
 */
import { Controller, Post, Get, Patch, Delete, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';
import { EvolutionApiClientService } from './evolution-api-client.service';
import { EvolutionInstanceService } from './evolution-instance.service';
import type {
  CreateGroupDto,
  UpdateParticipantsDto,
  UpdateGroupSubjectDto,
  UpdateGroupDescriptionDto,
  UpdateGroupPictureDto,
  UpdateGroupSettingDto,
  SendGroupInviteDto,
} from './dto/group.dto';

@ApiTags('WhatsApp Groups')
@ApiSecurity('x-api-key')
@Controller('whatsapp/groups')
export class WhatsAppGroupController {
  constructor(
    private readonly evolutionClient: EvolutionApiClientService,
    private readonly evolutionInstanceService: EvolutionInstanceService,
  ) {}

  private async resolveInstance(tenantSlug: string): Promise<string> {
    const inst = await this.evolutionInstanceService.findByTenant(tenantSlug);
    if (!inst?.instanceName) throw new HttpException('No WhatsApp instance configured for this tenant', HttpStatus.UNPROCESSABLE_ENTITY);
    return inst.instanceName;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new WhatsApp group' })
  @ApiResponse({ status: 201, description: 'Group created' })
  async createGroup(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateGroupDto,
  ): Promise<Record<string, unknown>> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.createGroup(
      instanceName,
      dto.subject,
      dto.participants,
      dto.description,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all groups' })
  @ApiResponse({ status: 200, description: 'Groups listed' })
  async listGroups(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<Record<string, unknown>[]> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.fetchAllGroups(instanceName);
  }

  @Get(':jid')
  @ApiOperation({ summary: 'Get group info' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Group info returned' })
  async getGroupInfo(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
  ): Promise<Record<string, unknown>> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.findGroupInfo(instanceName, jid);
  }

  @Get(':jid/participants')
  @ApiOperation({ summary: 'Get group participants' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Participants returned' })
  async getParticipants(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
  ): Promise<Record<string, unknown>[]> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.fetchGroupParticipants(instanceName, jid);
  }

  @Get(':jid/invite')
  @ApiOperation({ summary: 'Get group invite code' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Invite code returned' })
  async getInviteCode(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
  ): Promise<{ inviteCode: string }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.fetchGroupInviteCode(instanceName, jid);
  }

  @Patch(':jid/subject')
  @ApiOperation({ summary: 'Update group subject' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Subject updated' })
  async updateSubject(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
    @Body() dto: UpdateGroupSubjectDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.updateGroupSubject(instanceName, jid, dto.subject);
    return { success: true };
  }

  @Patch(':jid/description')
  @ApiOperation({ summary: 'Update group description' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Description updated' })
  async updateDescription(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
    @Body() dto: UpdateGroupDescriptionDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.updateGroupDescription(instanceName, jid, dto.description);
    return { success: true };
  }

  @Patch(':jid/picture')
  @ApiOperation({ summary: 'Update group picture' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Picture updated' })
  async updatePicture(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
    @Body() dto: UpdateGroupPictureDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.updateGroupPicture(instanceName, jid, dto.picture);
    return { success: true };
  }

  @Post(':jid/participants')
  @ApiOperation({ summary: 'Add, remove, promote or demote participants' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Participants updated' })
  async updateParticipants(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
    @Body() dto: UpdateParticipantsDto,
  ): Promise<Record<string, unknown>> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    return this.evolutionClient.updateGroupParticipants(
      instanceName,
      jid,
      dto.action,
      dto.participants,
    );
  }

  @Patch(':jid/settings')
  @ApiOperation({ summary: 'Update group settings (announcement/locked)' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  async updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
    @Body() dto: UpdateGroupSettingDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.updateGroupSetting(instanceName, jid, dto.action);
    return { success: true };
  }

  @Post(':jid/invite')
  @ApiOperation({ summary: 'Send group invite to numbers' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Invite sent' })
  async sendInvite(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
    @Body() dto: SendGroupInviteDto,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.sendGroupInvite(instanceName, jid, dto.numbers, dto.description);
    return { success: true };
  }

  @Delete(':jid')
  @ApiOperation({ summary: 'Leave a group' })
  @ApiParam({ name: 'jid', type: 'string' })
  @ApiResponse({ status: 200, description: 'Left group' })
  async leaveGroup(
    @CurrentTenant() tenant: TenantContext,
    @Param('jid') jid: string,
  ): Promise<{ success: boolean }> {
    const instanceName = await this.resolveInstance(tenant.tenantSlug);
    await this.evolutionClient.leaveGroup(instanceName, jid);
    return { success: true };
  }
}
