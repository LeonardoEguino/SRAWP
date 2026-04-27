import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AcademicCoreModule } from './academic-core/academic-core.module';

@Module({
  imports: [DatabaseModule, AcademicCoreModule],
  controllers: [],
  providers: [],
})
export class AppModule {}