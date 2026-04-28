import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AcademicCoreModule } from './academic-core/academic-core.module';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/app.config'
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { GoogeCalendarModule } from './google-calendar/google-calendar.module';
import { GoogleCalendarService } from './google-calendar/google-calendar.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema
    }),
    ScheduleModule.forRoot(),
    DatabaseModule, 
    AcademicCoreModule, 
    WhatsappModule, 
    GoogeCalendarModule,
  ],
  providers: [GoogleCalendarService],
})
export class AppModule {}