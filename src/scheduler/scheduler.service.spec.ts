import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AcademicModule } from '../academic-core/entities/academic-module.entity';
import { SentReminder } from './entities/sent-reminder.entity';
import { ReminderType } from './entities/sent-reminder.entity'; 

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCalendarEvent(overrides = {}) {
  return {
    id: 'google-evt-001',
    title: 'MOD-INTRODUCCION A LA INGENIERIA FINANCIERA',
    meetLink: 'https://meet.google.com/abc-xyz',
    startTime: new Date('2025-09-01T10:00:00-04:00'),
    endTime: new Date('2025-09-01T12:00:00-04:00'),
    ...overrides,
  };
}

function buildAcademicModule(overrides = {}) {
  return {
    id: 'am-001',
    name: 'Introducción a la Ingeniería Financiera',
    calendarPrefix: 'MOD-INTRODUCCION',
    program: {
      id: 'prog-001',
      name: 'Maestría en Finanzas',
      accountingCode: 'MIF-5065-25',
    },
    ...overrides,
  };
}

function buildRepositoryMock() {
  return {
    findOne: jest.fn(),
    save: jest.fn(),
  };
}

function buildConfigService(overrides: Record<string, string | number> = {}) {
  const values: Record<string, string | number> = {
    MORNING_REMINDER_HOUR: 9,
    MORNING_REMINDER_MINUTE: 30,
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key] ?? undefined),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SchedulerService', () => {
  let service: SchedulerService;
  let calendarService: { getUpcomingMeetEvents: jest.Mock };
  let whatsappService: { sendMessage: jest.Mock };
  let configService: ReturnType<typeof buildConfigService>;
  let academicModuleRepo: ReturnType<typeof buildRepositoryMock>;
  let sentReminderRepo: ReturnType<typeof buildRepositoryMock>;

  beforeEach(async () => {
    calendarService = { getUpcomingMeetEvents: jest.fn() };
    whatsappService = { sendMessage: jest.fn() };
    configService = buildConfigService();
    academicModuleRepo = buildRepositoryMock();
    sentReminderRepo = buildRepositoryMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: GoogleCalendarService, useValue: calendarService },
        { provide: WhatsappService, useValue: whatsappService },
        { provide: ConfigService, useValue: configService },
        { provide: getRepositoryToken(AcademicModule), useValue: academicModuleRepo },
        { provide: getRepositoryToken(SentReminder), useValue: sentReminderRepo },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── handleInmediateReminder() ───────────────────────────────────────────

  describe('handleInmediateReminder()', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    });

    it('caso feliz: llama a getUpcomingMeetEvents(15)', async () => {
      calendarService.getUpcomingMeetEvents.mockResolvedValue([]);

      await service.handleInmediateReminder();

      expect(calendarService.getUpcomingMeetEvents).toHaveBeenCalledWith(15);
    });

    it('termina sin procesar si getUpcomingMeetEvents retorna []', async () => {
      calendarService.getUpcomingMeetEvents.mockResolvedValue([]);

      await service.handleInmediateReminder();

      expect(sentReminderRepo.findOne).not.toHaveBeenCalled();
      expect(academicModuleRepo.findOne).not.toHaveBeenCalled();
      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('procesa todos los eventos aunque uno falle (Promise.allSettled)', async () => {
      const event1 = buildCalendarEvent({ id: 'evt-001', title: 'MOD-INTRO A FINANZAS' });
      const event2 = buildCalendarEvent({ id: 'evt-002', title: 'MOD-CONTABILIDAD AVANZADA' });

      calendarService.getUpcomingMeetEvents.mockResolvedValue([event1, event2]);
      sentReminderRepo.findOne.mockResolvedValue(null);
      academicModuleRepo.findOne
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(null);

      await expect(service.handleInmediateReminder()).resolves.not.toThrow();
    });

    it('no llama a resolveGroupId si el evento INMEDIATE ya fue enviado', async () => {
      const event = buildCalendarEvent();
      calendarService.getUpcomingMeetEvents.mockResolvedValue([event]);
      sentReminderRepo.findOne.mockResolvedValue({ id: 'reminder-001' });

      await service.handleInmediateReminder();

      expect(academicModuleRepo.findOne).not.toHaveBeenCalled();
    });

    it('no llama a sendReminder si resolveGroupId retorna null', async () => {
      const event = buildCalendarEvent({ title: 'Sin formato' });
      calendarService.getUpcomingMeetEvents.mockResolvedValue([event]);
      sentReminderRepo.findOne.mockResolvedValue(null);

      await service.handleInmediateReminder();

      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('flujo completo: consulta, match, envío y persistencia con ReminderType.INMEDIATE', async () => {
      const event = buildCalendarEvent();
      calendarService.getUpcomingMeetEvents.mockResolvedValue([event]);
      sentReminderRepo.findOne.mockResolvedValue(null);
      academicModuleRepo.findOne.mockResolvedValue(buildAcademicModule());
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await service.handleInmediateReminder();

      expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
      expect(sentReminderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ reminderType: ReminderType.INMEDIATE }),
      );
    });
  });

  // ─── handleMorningReminder() ─────────────────────────────────────────────

  describe('handleMorningReminder()', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getMinutesUntilEndOfDay').mockReturnValue(480);
    });

    it('caso feliz: llama a getUpcomingMeetEvents con los minutos hasta el fin del día', async () => {
      calendarService.getUpcomingMeetEvents.mockResolvedValue([]);

      await service.handleMorningReminder();

      expect(calendarService.getUpcomingMeetEvents).toHaveBeenCalledWith(480);
    });

    it('termina sin procesar si getUpcomingMeetEvents retorna []', async () => {
      calendarService.getUpcomingMeetEvents.mockResolvedValue([]);

      await service.handleMorningReminder();

      expect(sentReminderRepo.findOne).not.toHaveBeenCalled();
      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('no llama a resolveGroupId si el evento MORNING ya fue enviado', async () => {
      const event = buildCalendarEvent();
      calendarService.getUpcomingMeetEvents.mockResolvedValue([event]);
      sentReminderRepo.findOne.mockResolvedValue({ id: 'reminder-002' });

      await service.handleMorningReminder();

      expect(academicModuleRepo.findOne).not.toHaveBeenCalled();
    });

    it('flujo completo: consulta, match, envío y persistencia con ReminderType.MORNING', async () => {
      const event = buildCalendarEvent();
      calendarService.getUpcomingMeetEvents.mockResolvedValue([event]);
      sentReminderRepo.findOne.mockResolvedValue(null);
      academicModuleRepo.findOne.mockResolvedValue(buildAcademicModule());
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await service.handleMorningReminder();

      expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
      expect(sentReminderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ reminderType: ReminderType.MORNING }),
      );
    });
  });

  // ─── Independencia entre ReminderTypes ────────────────────────────────────

  describe('independencia entre ReminderType.MORNING e ReminderType.INMEDIATE', () => {
    it('un evento con MORNING enviado puede recibir INMEDIATE y viceversa', async () => {
      sentReminderRepo.findOne
        .mockResolvedValueOnce({ id: 'r-morning' }) // MORNING → ya enviado
        .mockResolvedValueOnce(null);               // INMEDIATE → no enviado

      const morningResult = await (service as any).wasReminderSent('evt-001', ReminderType.MORNING);
      const INMEDIATEResult = await (service as any).wasReminderSent('evt-001', ReminderType.INMEDIATE);

      expect(morningResult).toBe(true);
      expect(INMEDIATEResult).toBe(false);
    });
  });

  // ─── wasReminderSent() ────────────────────────────────────────────────────

  describe('wasReminderSent()', () => {
    it('retorna false cuando no existe registro con esa combinación', async () => {
      sentReminderRepo.findOne.mockResolvedValue(null);

      const result = await (service as any).wasReminderSent('google-evt-001', ReminderType.INMEDIATE);

      expect(result).toBe(false);
    });

    it('retorna true cuando ya existe registro con el mismo googleEventId y reminderType', async () => {
      sentReminderRepo.findOne.mockResolvedValue({
        id: 'reminder-001',
        googleEventId: 'google-evt-001',
        reminderType: ReminderType.INMEDIATE,
      });

      const result = await (service as any).wasReminderSent('google-evt-001', ReminderType.INMEDIATE);

      expect(result).toBe(true);
    });

    it('consulta el repositorio incluyendo googleEventId y reminderType', async () => {
      sentReminderRepo.findOne.mockResolvedValue(null);

      await (service as any).wasReminderSent('evt-target', ReminderType.MORNING);

      expect(sentReminderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            googleEventId: 'evt-target',
            reminderType: ReminderType.MORNING,
          },
        }),
      );
    });
  });

  // ─── resolveGroupId() ─────────────────────────────────────────────────────

  describe('resolveGroupId()', () => {
    it('caso feliz: extrae el prefijo y retorna el accountingCode del Program relacionado', async () => {
      academicModuleRepo.findOne.mockResolvedValue(buildAcademicModule());

      const result = await (service as any).resolveGroupId(
        'MOD-INTRODUCCION A LA INGENIERIA FINANCIERA',
      );

      expect(result).toBe('MIF-5065-25');
    });

    it('retorna null si el título no tiene formato PREFIX-PALABRA', async () => {
      const result = await (service as any).resolveGroupId('Sin formato válido');

      expect(result).toBeNull();
      expect(academicModuleRepo.findOne).not.toHaveBeenCalled();
    });

    it('retorna null si no existe AcademicModule con ese prefix en BD', async () => {
      academicModuleRepo.findOne.mockResolvedValue(null);

      const result = await (service as any).resolveGroupId('MOD-INEXISTENTE tema cualquiera');

      expect(result).toBeNull();
    });

    it('retorna null si el AcademicModule no tiene program relacionado', async () => {
      academicModuleRepo.findOne.mockResolvedValue(
        buildAcademicModule({ program: null }),
      );

      const result = await (service as any).resolveGroupId(
        'MOD-INTRODUCCION A LA INGENIERIA FINANCIERA',
      );

      expect(result).toBeNull();
    });

    it('busca en BD usando el prefijo extraído del título', async () => {
      academicModuleRepo.findOne.mockResolvedValue(buildAcademicModule());

      await (service as any).resolveGroupId('MOD-INTRODUCCION A LA INGENIERIA');

      expect(academicModuleRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { calendarPrefix: 'MOD-INTRODUCCION' },
        }),
      );
    });
  });

  // ─── extractPrefix() ──────────────────────────────────────────────────────

  describe('extractPrefix()', () => {
    it('caso feliz: extrae PREFIX-PALABRA del inicio del título', () => {
      const result = (service as any).extractPrefix(
        'MOD-INTRODUCCION A LA INGENIERIA FINANCIERA',
      );

      expect(result).toBe('MOD-INTRODUCCION');
    });

    it('retorna null cuando el título no tiene formato PREFIX-PALABRA', () => {
      const result = (service as any).extractPrefix('Sin formato');

      expect(result).toBeNull();
    });

    it('retorna null cuando el título está en minúsculas', () => {
      const result = (service as any).extractPrefix('mod-introduccion tema');

      expect(result).toBeNull();
    });

    it('retorna null para string vacío', () => {
      const result = (service as any).extractPrefix('');

      expect(result).toBeNull();
    });

    it('extrae correctamente con distintos prefijos válidos', () => {
      expect((service as any).extractPrefix('FIN-MERCADOS tema')).toBe('FIN-MERCADOS');
      expect((service as any).extractPrefix('ADM-ESTRATEGIA sesión')).toBe('ADM-ESTRATEGIA');
    });
  });

  // ─── sendReminder() ───────────────────────────────────────────────────────

  describe('sendReminder()', () => {
    const event = buildCalendarEvent();
    const groupId = 'MIF-5065-25';

    it('caso feliz MORNING: envía, persiste con ReminderType.MORNING y loggea éxito', async () => {
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await (service as any).sendReminder(event, groupId, ReminderType.MORNING);

      expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
      expect(sentReminderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          googleEventId: event.id,
          reminderType: ReminderType.MORNING,
        }),
      );
    });

    it('caso feliz INMEDIATE: envía, persiste con ReminderType.INMEDIATE y loggea éxito', async () => {
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await (service as any).sendReminder(event, groupId, ReminderType.INMEDIATE);

      expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
      expect(sentReminderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          googleEventId: event.id,
          reminderType: ReminderType.INMEDIATE,
        }),
      );
    });

    it('pasa el groupId a sendMessage()', async () => {
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await (service as any).sendReminder(event, groupId, ReminderType.INMEDIATE);

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        groupId,
        expect.any(String),
      );
    });

    it('no guarda en sent_reminders si sendMessage() retorna false', async () => {
      whatsappService.sendMessage.mockResolvedValue(false);

      await (service as any).sendReminder(event, groupId, ReminderType.INMEDIATE);

      expect(sentReminderRepo.save).not.toHaveBeenCalled();
    });

    it('loggea error via this.logger si sendMessage() retorna false', async () => {
      const loggerSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => {});
      whatsappService.sendMessage.mockResolvedValue(false);

      await (service as any).sendReminder(event, groupId, ReminderType.INMEDIATE);

      expect(loggerSpy).toHaveBeenCalled();
    });
  });

  // ─── buildMessage() ───────────────────────────────────────────────────────

  describe('buildMessage()', () => {
    const event = buildCalendarEvent({
      title: 'MOD-FINANZAS Introducción',
      meetLink: 'https://meet.google.com/abc-xyz',
      startTime: new Date('2025-09-01T10:00:00'),
    });

    describe('ReminderType.MORNING', () => {
      it('contiene "hoy" en el mensaje', () => {
        const message = (service as any).buildMessage(event, ReminderType.MORNING);
        expect(message.toLowerCase()).toContain('hoy');
      });

      it('contiene el título del evento', () => {
        const message = (service as any).buildMessage(event, ReminderType.MORNING);
        expect(message).toContain('MOD-FINANZAS Introducción');
      });

      it('contiene la hora formateada (HH:MM)', () => {
        const message = (service as any).buildMessage(event, ReminderType.MORNING);
        expect(message).toMatch(/\d{1,2}:\d{2}/);
      });

      it('contiene el meetLink', () => {
        const message = (service as any).buildMessage(event, ReminderType.MORNING);
        expect(message).toContain('https://meet.google.com/abc-xyz');
      });
    });

    describe('ReminderType.INMEDIATE', () => {
      it('contiene "15 minutos" en el mensaje', () => {
        const message = (service as any).buildMessage(event, ReminderType.INMEDIATE);
        expect(message.toLowerCase()).toContain('15 minutos');
      });

      it('contiene el título del evento', () => {
        const message = (service as any).buildMessage(event, ReminderType.INMEDIATE);
        expect(message).toContain('MOD-FINANZAS Introducción');
      });

      it('contiene la hora formateada (HH:MM)', () => {
        const message = (service as any).buildMessage(event, ReminderType.INMEDIATE);
        expect(message).toMatch(/\d{1,2}:\d{2}/);
      });

      it('contiene el meetLink', () => {
        const message = (service as any).buildMessage(event, ReminderType.INMEDIATE);
        expect(message).toContain('https://meet.google.com/abc-xyz');
      });
    });
  });

  // ─── randomDelay() ────────────────────────────────────────────────────────

  describe('randomDelay()', () => {
    it('retorna un valor dentro del rango [min*60000, max*60000]', () => {
      const result = (service as any).randomDelay(1, 3);

      expect(result).toBeGreaterThanOrEqual(1 * 60_000);
      expect(result).toBeLessThanOrEqual(3 * 60_000);
    });

    it('retorna exactamente min*60000 cuando Math.random() = 0', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);

      const result = (service as any).randomDelay(1, 3);

      expect(result).toBe(1 * 60_000);
    });

    it('con Math.random() = 1 no supera max*60000 — fórmula sin +1', () => {
      jest.spyOn(Math, 'random').mockReturnValue(1);

      const result = (service as any).randomDelay(1, 3);

      // Math.floor(1 * (3 - 1)) + 1 = 3 → 3 * 60000
      expect(result).toBeLessThanOrEqual(3 * 60_000);
    });
  });
});