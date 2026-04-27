import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AcademicCoreModule } from './academic-core/academic-core.module';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/app.config'
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema
    }),
    DatabaseModule, 
    AcademicCoreModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}