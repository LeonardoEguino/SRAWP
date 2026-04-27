import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AcademicCoreModule } from './academic-core/academic-core.module';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/app.config'
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema
    }),
    DatabaseModule, 
    AcademicCoreModule, WhatsappModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}