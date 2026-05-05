import { Injectable, Logger } from '@nestjs/common';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AcademicModule } from '../academic-core/entities/academic-module.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ReminderType, SentReminder } from './entities/sent-reminder.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CalendarEvent } from '../google-calendar/interfaces/calendar-event.interface';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly calendarService: GoogleCalendarService,
        private readonly whatsappService: WhatsappService,
        private readonly config: ConfigService,
        @InjectRepository(AcademicModule)
        private readonly moduleRepo: Repository<AcademicModule>,
        @InjectRepository(SentReminder)
        private readonly reminderRepo: Repository<SentReminder>
    ) {}

    @Cron(CronExpression.EVERY_10_MINUTES)
    async handleInmediateReminder(): Promise<void> {
        this.logger.log('Escaneado eventos proximos...');

        const events = await this.calendarService.getUpcomingMeetEvents(15);
        if(!events.length) return;

        await Promise.allSettled(
            events.map((event) => this.processEvent(event, ReminderType.INMEDIATE))
        );
    }

    @Cron('0 30 9 * * *')
    async handleMorningReminder(): Promise<void> {
        const morningHour = this.config.get<number>('MORNING_REMINDER_HOUR', 9);
        const morningMinute = this.config.get<number>('MORNING_REMINDER_MINUTE', 30);
        this.logger.log(`Recordatorio matutino (${morningHour}:${morningMinute})...`);

        const events = await this.calendarService.getUpcomingMeetEvents(
            this.getMinutesUntilEndOfDay(),
        );
        if (!events.length) return;

        await Promise.allSettled(
            events.map((event) => this.processEvent(event, ReminderType.MORNING))
        )
    }

    private async processEvent(event: CalendarEvent, reminderType: ReminderType): Promise<void> {
        const alreadySent = await this.wasReminderSent(event.id, reminderType);
        if (alreadySent) return;

        const groupId = await this.resolveGroupId(event.title);
        if (!groupId) {
            this.logger.warn(`Sin match para el evento: "${event.title}"`);
            return;
        }

        await this.scheduleWithDelay(event, groupId, reminderType);
    }

    private async wasReminderSent(googleEventId: string, reminderType: ReminderType): Promise<boolean> {
        const existing = await this.reminderRepo.findOne({
            where: { googleEventId, reminderType },
        });
        return !!existing;
    }

    private async resolveGroupId(eventTitle: string): Promise<string | null> {
        const prefix = this.extractPrefix(eventTitle);
        if (!prefix) return null;

        const module = await this.moduleRepo.findOne({
            where: { calendarPrefix: prefix },
            relations: ['program'],
        });

        return module?.program?.accountingCode ?? null;
    }

    private extractPrefix(title: string): string | null {
        const match = title.match(/^([A-Z]+-[A-Z]+)/);
        return match?.[1] ?? null;
    }

    private async scheduleWithDelay(
        event: CalendarEvent, 
        groupId: string, 
        reminderType: ReminderType,
    ): Promise<void> {
        const delayMs = this.randomDelay(1, 3);
        await this.sleep(delayMs);
        await this.sendReminder(event, groupId, reminderType);
    }

    private async sendReminder (
        event: CalendarEvent, 
        groupId: string,
        reminderType: ReminderType,
    ): Promise<void> {
        const message = this.buildMessage(event, reminderType);
        const sent = await this.whatsappService.sendMessage(groupId, message);

        if (sent) {
            await this.reminderRepo.save({googleEventId: event.id, reminderType});
            this.logger.log(`Recordatorio enviado: "${event.title}" -> ${groupId}`);
        } else {
            this.logger.error(`Fallo el envio: "${event.title}" -> ${groupId}`);
        }
    }

    private buildMessage(event: CalendarEvent, reminderType: ReminderType): string {
        const hora = event.startTime.toLocaleDateString('es-BO', {
            hour: '2-digit',
            minute: '2-digit'
        });

        if(reminderType === ReminderType.MORNING){
            return (
                `📅 *Recordatorio de reunión para hoy*\n\n` +
                `📌 ${event.title}\n` +
                `🕐 ${hora}\n` +
                `🔗 ${event.meetLink}`
            );
        }

        return (
        `⏰ *Tu reunión comienza en 15 minutos*\n\n` +
        `📌 ${event.title}\n` +
        `🕐 ${hora}\n` +
        `🔗 ${event.meetLink}`
        );
    }

    private getMinutesUntilEndOfDay(): number {
        const now = new Date();
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        return Math.floor((endOfDay.getTime() - now.getTime()) / 60000);
    }

    private randomDelay(minMinutes: number, maxMinutes: number): number {
        const min = minMinutes * 60 * 1000;
        const max = maxMinutes * 60 * 1000;
        return Math.floor(Math.random() * (max - min)) + min;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
