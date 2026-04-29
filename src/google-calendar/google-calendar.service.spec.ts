import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleCalendarService } from './google-calendar.service';

// ─── Mocks de googleapis ────────────────────────────────────────────────────

const mockEventsList = jest.fn();
const mockCalendarInstance = {
  events: {
    list: mockEventsList,
  },
};

jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn(() => ({})),
    },
    calendar: jest.fn(() => mockCalendarInstance),
  },
}));

import { google } from 'googleapis';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-001',
    summary: 'Módulo de Finanzas',
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    start: { dateTime: '2025-09-01T10:00:00-04:00' },
    end: { dateTime: '2025-09-01T12:00:00-04:00' },
    ...overrides,
  };
}

function buildConfigService(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@project.iam.gserviceaccount.com',
    GOOGLE_PRIVATE_KEY: 'KEY_LINE_1\\nKEY_LINE_2',
    GOOGLE_CALENDAR_ID: 'calendar-id@group.calendar.google.com',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key] ?? ''),
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;
  let configService: ReturnType<typeof buildConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = buildConfigService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<GoogleCalendarService>(GoogleCalendarService);
  });

  // ─── onModuleInit ──────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('caso feliz: debe instanciar el cliente JWT y el cliente Calendar sin errores', async () => {
      expect(() => service.onModuleInit()).not.toThrow();

      expect(google.auth.JWT).toHaveBeenCalledTimes(1);
      expect(google.calendar).toHaveBeenCalledTimes(1);
    });

    it('debe transformar GOOGLE_PRIVATE_KEY reemplazando \\\\n literales por saltos de línea reales', async () => {
      await service.onModuleInit();

      const jwtCallArgs = (google.auth.JWT as unknown as jest.Mock).mock.calls[0][0];
      expect(jwtCallArgs.key).toBe('KEY_LINE_1\nKEY_LINE_2');
    });

    it('debe pasar GOOGLE_SERVICE_ACCOUNT_EMAIL como email al cliente JWT', async () => {
      await service.onModuleInit();

      const jwtCallArgs = (google.auth.JWT as unknown as jest.Mock).mock.calls[0][0];
      expect(jwtCallArgs.email).toBe('sa@project.iam.gserviceaccount.com');
    });
  });

  // ─── getUpcomingMeetEvents ─────────────────────────────────────────────────

  describe('getUpcomingMeetEvents()', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      jest.clearAllMocks();
    });

    // ── Caso feliz ────────────────────────────────────────────────────────────

    it('caso feliz: retorna CalendarEvent[] mapeados correctamente cuando la API devuelve eventos con hangoutLink', async () => {
      const rawEvent = buildEvent();
      mockEventsList.mockResolvedValueOnce({
        data: { items: [rawEvent] },
      });

      const result = await service.getUpcomingMeetEvents();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'evt-001',
        title: 'Módulo de Finanzas',
        meetLink: 'https://meet.google.com/abc-defg-hij',
        startTime: new Date('2025-09-01T10:00:00-04:00'),
        endTime: new Date('2025-09-01T12:00:00-04:00'),
      });
    });

    it('pasa GOOGLE_CALENDAR_ID al llamar a calendar.events.list', async () => {
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } });

      await service.getUpcomingMeetEvents();

      expect(mockEventsList).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'calendar-id@group.calendar.google.com' }),
      );
    });

    // ── Parámetro minutesAhead ────────────────────────────────────────────────

    it('usa minutesAhead = 15 por defecto si no se pasa parámetro', async () => {
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } });

      const before = Date.now();
      await service.getUpcomingMeetEvents();
      const after = Date.now();

      const callArgs = mockEventsList.mock.calls[0][0];
      const timeMax = new Date(callArgs.timeMax).getTime();

      const fifteenMinMs = 15 * 60 * 1000;
      expect(timeMax).toBeGreaterThanOrEqual(before + fifteenMinMs - 100);
      expect(timeMax).toBeLessThanOrEqual(after + fifteenMinMs + 100);
    });

    it('respeta un minutesAhead personalizado cuando se proporciona', async () => {
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } });

      const before = Date.now();
      await service.getUpcomingMeetEvents(30);
      const after = Date.now();

      const callArgs = mockEventsList.mock.calls[0][0];
      const timeMax = new Date(callArgs.timeMax).getTime();

      const thirtyMinMs = 30 * 60 * 1000;
      expect(timeMax).toBeGreaterThanOrEqual(before + thirtyMinMs - 100);
      expect(timeMax).toBeLessThanOrEqual(after + thirtyMinMs + 100);
    });

    // ── Arrays vacíos / undefined ─────────────────────────────────────────────

    it('retorna [] cuando la API devuelve items = []', async () => {
      mockEventsList.mockResolvedValueOnce({ data: { items: [] } });

      const result = await service.getUpcomingMeetEvents();

      expect(result).toEqual([]);
    });

    it('retorna [] cuando la API devuelve items = undefined', async () => {
      mockEventsList.mockResolvedValueOnce({ data: {} });

      const result = await service.getUpcomingMeetEvents();

      expect(result).toEqual([]);
    });

    // ── Filtrado por Meet link ────────────────────────────────────────────────

    it('filtra eventos que no tienen hangoutLink ni conferenceData con entryPoint video', async () => {
      const eventWithoutMeet = buildEvent({
        hangoutLink: undefined,
        conferenceData: undefined,
      });
      mockEventsList.mockResolvedValueOnce({
        data: { items: [eventWithoutMeet] },
      });

      const result = await service.getUpcomingMeetEvents();

      expect(result).toEqual([]);
    });

    it('filtra eventos cuyo conferenceData solo tiene entryPoints que no son de tipo video', async () => {
      const eventPhoneOnly = buildEvent({
        hangoutLink: undefined,
        conferenceData: {
          entryPoints: [{ entryPointType: 'phone', uri: 'tel:+15551234567' }],
        },
      });
      mockEventsList.mockResolvedValueOnce({
        data: { items: [eventPhoneOnly] },
      });

      const result = await service.getUpcomingMeetEvents();

      expect(result).toEqual([]);
    });

    // ── Extracción desde conferenceData ───────────────────────────────────────

    it('extrae meetLink desde conferenceData.entryPoints cuando hangoutLink no está presente', async () => {
      const eventViaConferenceData = buildEvent({
        hangoutLink: undefined,
        conferenceData: {
          entryPoints: [
            { entryPointType: 'video', uri: 'https://meet.google.com/xyz-uvwx-yz' },
          ],
        },
      });
      mockEventsList.mockResolvedValueOnce({
        data: { items: [eventViaConferenceData] },
      });

      const result = await service.getUpcomingMeetEvents();

      expect(result).toHaveLength(1);
      expect(result[0].meetLink).toBe('https://meet.google.com/xyz-uvwx-yz');
    });

    it('prefiere hangoutLink sobre conferenceData cuando ambos están presentes', async () => {
      const eventBoth = buildEvent({
        hangoutLink: 'https://meet.google.com/from-hangout',
        conferenceData: {
          entryPoints: [
            { entryPointType: 'video', uri: 'https://meet.google.com/from-conference' },
          ],
        },
      });
      mockEventsList.mockResolvedValueOnce({
        data: { items: [eventBoth] },
      });

      const result = await service.getUpcomingMeetEvents();

      expect(result[0].meetLink).toBe('https://meet.google.com/from-hangout');
    });

    // ── Fallback de fecha a event.start.date ──────────────────────────────────

    it('usa event.start.date como fallback para startTime/endTime en eventos de día completo', async () => {
      const allDayEvent = buildEvent({
        start: { date: '2025-09-05' },
        end: { date: '2025-09-06' },
      });
      mockEventsList.mockResolvedValueOnce({
        data: { items: [allDayEvent] },
      });

      const result = await service.getUpcomingMeetEvents();

      expect(result[0].startTime).toEqual(new Date('2025-09-05'));
      expect(result[0].endTime).toEqual(new Date('2025-09-06'));
    });

    // ── Manejo de errores ─────────────────────────────────────────────────────

    it('retorna [] y no propaga la excepción cuando calendar.events.list lanza un error de red', async () => {
      mockEventsList.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getUpcomingMeetEvents()).resolves.toEqual([]);
    });

    it('retorna [] y no propaga la excepción ante un error de credenciales inválidas (401)', async () => {
      const authError = Object.assign(new Error('Invalid credentials'), { code: 401 });
      mockEventsList.mockRejectedValueOnce(authError);

      await expect(service.getUpcomingMeetEvents()).resolves.toEqual([]);
    });

    it('loggea el error cuando calendar.events.list lanza una excepción', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
      mockEventsList.mockRejectedValueOnce(new Error('API failure'));

      await service.getUpcomingMeetEvents();

      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });

    // ── Mezcla de eventos ─────────────────────────────────────────────────────

    it('retorna solo los eventos con Meet link cuando la API mezcla eventos con y sin link', async () => {
      const withMeet = buildEvent({ id: 'evt-meet', hangoutLink: 'https://meet.google.com/aaa' });
      const withoutMeet = buildEvent({
        id: 'evt-no-meet',
        hangoutLink: undefined,
        conferenceData: undefined,
      });

      mockEventsList.mockResolvedValueOnce({
        data: { items: [withMeet, withoutMeet] },
      });

      const result = await service.getUpcomingMeetEvents();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('evt-meet');
    });
  });
});