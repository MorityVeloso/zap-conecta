import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesListener } from './messages.listener';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, MessagesListener],
  exports: [MessagesService],
})
export class MessagesModule {}
