import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WHATSAPP_PROVIDER, type WhatsappProvider } from './providers/whatsapp-provider.interface';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
    constructor(
        @Inject(WHATSAPP_PROVIDER)
        private readonly provider: WhatsappProvider,
    ) {}

    async onModuleDestroy() {
        await this.provider.disconnect();
    }

    async onModuleInit() {
        await this.provider.connect();
    }
    
    async sendMessage(groupId: string, text: string): Promise<boolean>{
        return this.provider.sendMessage(groupId, text);
    }

    isConnected() {
        return this.provider.isConnected();
    }
}
