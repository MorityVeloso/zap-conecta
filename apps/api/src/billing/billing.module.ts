import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { UsageService } from './usage.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, UsageService],
  exports: [BillingService, UsageService],
})
export class BillingModule {}
