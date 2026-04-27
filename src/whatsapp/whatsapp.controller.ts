import { Controller, Get } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
    constructor(
        private readonly whatsappService: WhatsappService
    ) {}

    @Get('connected')
    getStatus() {
        return this.whatsappService.isConnected()
    }
}
