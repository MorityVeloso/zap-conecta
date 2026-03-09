import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { UsageService } from './usage.service';
import { BillingEmailService } from './billing-email.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, UsageService, BillingEmailService],
  exports: [BillingService, UsageService, BillingEmailService],
})
export class BillingModule {}
