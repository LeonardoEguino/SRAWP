import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { calendar_v3, google } from 'googleapis';
import { CalendarEvent } from './interfaces/calendar-event.interface';

@Injectable()
export class GoogleCalendarService implements OnModuleInit{
    private readonly logger = new Logger(GoogleCalendarService.name);
    private calendar: calendar_v3.Calendar;

    constructor(private readonly config: ConfigService) { }
    
    onModuleInit() {
        this.initializeClient();
    }

    private initializeClient(): void {
        const auth = new google.auth.JWT({
            email: this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
            key: this.config.get<string>('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        });

        this.calendar = google.calendar({ version: 'v3', auth });
        this.logger.log('Google Calendar client inicializado.');
    }

    async getUpcomingMeetEvents(minutesAhead: number = 15): Promise<CalendarEvent[]> {
        const now = new Date();
        const timeMax = new Date(now.getTime() + minutesAhead * 60 * 1000);

        try {
            const response = await this.calendar.events.list({
                calendarId: this.config.get<string>('GOOGLE_CALENDAR_ID'),
                timeMin: now.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.data.items ?? [];

            return events
                .filter((event) => this.hasMeetLink(event))
                .map((event) => this.mapToCalendarEvent(event));
        } catch (error) {
            this.logger.error('Error consultando Google Calendar:', error);
            return [];
        }
    }

    private hasMeetLink(event: calendar_v3.Schema$Event): boolean {
        return !!(
            event.hangoutLink ||
            event.conferenceData?.entryPoints?.some((ep) => ep.entryPointType === 'video')
        );
    }

    private getMeetLink(event: calendar_v3.Schema$Event): string {
        if (event.hangoutLink) return event.hangoutLink;

        const videoEntry = event.conferenceData?.entryPoints?.find(
            (ep) => ep.entryPointType === 'video',
        );
        return videoEntry?.uri ?? '';
    }

    private mapToCalendarEvent(event: calendar_v3.Schema$Event): CalendarEvent {
        return {
            id: event.id!,
            title: event.summary ?? '',
            meetLink: this.getMeetLink(event),
            startTime: new Date(event.start?.dateTime ?? event.start?.date ?? ''),
            endTime: new Date(event.end?.dateTime ?? event.end?.date ?? ''),
        }
    }
    
}
