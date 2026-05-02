import { Injectable, Logger } from '@nestjs/common';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AcademicModule } from '../academic-core/entities/academic-module.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { SentReminder } from './entities/sent-reminder.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CalendarEvent } from '../google-calendar/interfaces/calendar-event.interface';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly calendarService: GoogleCalendarService,
        private readonly whatsappService: WhatsappService,
        @InjectRepository(AcademicModule)
        private readonly moduleRepo: Repository<AcademicModule>,
        @InjectRepository(SentReminder)
        private readonly reminderRepo: Repository<SentReminder>
    ) {}

    @Cron(CronExpression.EVERY_10_MINUTES)
    async handleReminder(): Promise<void> {
        this.logger.log('Escaneado eventos proximos...');

        const events = await this.calendarService.getUpcomingMeetEvents(15);
        if(!events.length) return;

        await Promise.allSettled(
            events.map((event) => this.processEvent(event))
        );
    }

    private async processEvent(event: CalendarEvent): Promise<void> {
        const alreadySent = await this.wasReminderSent(event.id);
        if (alreadySent) return;

        const groupId = await this.resolveGroupId(event.title);
        if (!groupId) {
            this.logger.warn(`Sin match para el evento: "${event.title}"`);
            return;
        }

        await this.scheduleWithDelay(event, groupId);
    }

    private async wasReminderSent(googleEventId: string): Promise<boolean> {
        const existing = await this.reminderRepo.findOne({ where: { googleEventId } });
        return !!existing;
    }

    private async resolveGroupId(eventTitle: string): Promise<string | null> {
        const prefix = this.extractPrefix(eventTitle);
        if (!prefix) return null;

        const module = await this.moduleRepo.findOne({
            where: { calendarPrefix: prefix },
            relations: ['program'],
        });

        return module?.program.accountingCode ?? null;
    }

    private extractPrefix(title: string): string | null {
        const match = title.match(/^([A-Z]+-[A-Z]+)/);
        return match?.[1] ?? null;
    }

    private async scheduleWithDelay(event: CalendarEvent, groupId: string): Promise<void> {
        const delayMs = this.randomDelay(1, 3);
        this.logger.log(
            `Enviando recordatorio para "${event.title}" en ${delayMs / 60000} min ...`
        )

        await this.sleep(delayMs);
        await this.sendReminder(event, groupId);
    }

    private async sendReminder (event: CalendarEvent, groupId: string): Promise<void> {
        const message = this.buildMessage(event);
        const sent = await this.whatsappService.sendMessage(groupId, message);

        if (sent) {
            await this.reminderRepo.save({googleEventId: event.id});
            this.logger.log(`Recordatorio enviado: "${event.title}" -> ${groupId}`);
        } else {
            this.logger.error(`Fallo el envio: "${event.title}" -> ${groupId}`);
        }
    }

    private buildMessage(event: CalendarEvent): string {
        return (
            `📅 *Recordatorio de reunión*\n\n` +
            `📌 ${event.title}\n` +
            `🕐 ${event.startTime.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}\n` +
            `🔗 ${event.meetLink}`
        );
    }

    private randomDelay(minMinutes: number, maxMinutes: number): number {
        const min = minMinutes * 60 * 1000;
        const max = maxMinutes * 60 * 1000;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
