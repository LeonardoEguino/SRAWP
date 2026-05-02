import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicModule } from '../academic-core/entities/academic-module.entity';
import { SentReminder } from './entities/sent-reminder.entity';
import { GoogeCalendarModule } from '../google-calendar/google-calendar.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AcademicModule, SentReminder]),
    GoogeCalendarModule,
    WhatsappModule
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
