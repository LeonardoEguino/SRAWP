import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappSession } from './entities/whatsapp-session.entity';
import { WHATSAPP_PROVIDER } from './providers/whatsapp-provider.interface';
import { BaileysProvider } from './providers/baileys/baileys.provider';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappSession])],
  providers: [
    WhatsappService,
    {
      provide: WHATSAPP_PROVIDER,
      useClass: BaileysProvider, // <-- Cambiar para futuros providers (meta, twilio, etc...)
    },
  ],
  exports: [WhatsappService],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
