import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../auth/supabase-jwt.guard';
import { TenantsService, SignupDtoSchema, UpdateTenantDtoSchema } from './tenants.service';

@ApiTags('Tenants')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('signup')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar conta (tenant + usuário)' })
  @ApiResponse({ status: 201, description: 'Conta criada. Verifique o email.' })
  @ApiResponse({ status: 409, description: 'Email já cadastrado' })
  async signup(@Body() body: unknown) {
    const dto = SignupDtoSchema.parse(body);
    return this.tenantsService.signup(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Dados do tenant autenticado' })
  @ApiResponse({ status: 200, description: 'Dados do tenant' })
  async getMe(@CurrentTenant() ctx: TenantContext) {
    return this.tenantsService.getMyTenant(ctx);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Uso de mensagens do mês atual' })
  @ApiResponse({ status: 200, description: 'Uso atual' })
  async getUsage(@CurrentTenant() ctx: TenantContext) {
    return this.tenantsService.getUsage(ctx);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atualizar dados do tenant' })
  @ApiResponse({ status: 200, description: 'Tenant atualizado' })
  async updateMe(@CurrentTenant() ctx: TenantContext, @Body() body: unknown) {
    const dto = UpdateTenantDtoSchema.parse(body);
    return this.tenantsService.updateTenant(ctx, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Stats para o dashboard' })
  @ApiResponse({ status: 200, description: 'Estatísticas do dashboard' })
  async getStats(@CurrentTenant() ctx: TenantContext) {
    return this.tenantsService.getDashboardStats(ctx);
  }
}
