import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);

  const port = config.get<number>('PORT') ?? 3000;
  const env = config.get<string>('NODE_ENV');

  console.log(`Running in ${env} mode`)

  await app.listen(port);
  console.log(`Application running on port: ${port}`)
}
bootstrap();
