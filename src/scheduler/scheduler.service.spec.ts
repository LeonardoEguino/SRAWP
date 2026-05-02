import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AcademicModule } from '../academic-core/entities/academic-module.entity';
import { SentReminder } from './entities/sent-reminder.entity';

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

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SchedulerService', () => {
  let service: SchedulerService;
  let calendarService: { getUpcomingMeetEvents: jest.Mock };
  let whatsappService: { sendMessage: jest.Mock };
  let academicModuleRepo: ReturnType<typeof buildRepositoryMock>;
  let sentReminderRepo: ReturnType<typeof buildRepositoryMock>;

  beforeEach(async () => {
    calendarService = { getUpcomingMeetEvents: jest.fn() };
    whatsappService = { sendMessage: jest.fn() };
    academicModuleRepo = buildRepositoryMock();
    sentReminderRepo = buildRepositoryMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: GoogleCalendarService, useValue: calendarService },
        { provide: WhatsappService, useValue: whatsappService },
        { provide: getRepositoryToken(AcademicModule), useValue: academicModuleRepo },
        { provide: getRepositoryToken(SentReminder), useValue: sentReminderRepo },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);

    // Silenciar logs en todos los tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── handleReminder() ────────────────────────────────────────────────────

  describe('handleReminder()', () => {
    beforeEach(() => {
      // Mockear sleep/delay para que los tests no esperen
      jest.spyOn(service as any, 'scheduleWithDelay').mockResolvedValue(undefined);
    });

    it('caso feliz: llama a getUpcomingMeetEvents(15)', async () => {
      calendarService.getUpcomingMeetEvents.mockResolvedValue([]);

      await service.handleReminder();

      expect(calendarService.getUpcomingMeetEvents).toHaveBeenCalledWith(15);
    });

    it('termina sin llamar a ningún otro método si getUpcomingMeetEvents retorna []', async () => {
      calendarService.getUpcomingMeetEvents.mockResolvedValue([]);

      await service.handleReminder();

      expect(sentReminderRepo.findOne).not.toHaveBeenCalled();
      expect(academicModuleRepo.findOne).not.toHaveBeenCalled();
      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('procesa todos los eventos aunque uno falle (Promise.allSettled)', async () => {
      const event1 = buildCalendarEvent({ id: 'evt-001', title: 'MOD-INTRO A FINANZAS' });
      const event2 = buildCalendarEvent({ id: 'evt-002', title: 'MOD-CONTABILIDAD AVANZADA' });

      calendarService.getUpcomingMeetEvents.mockResolvedValue([event1, event2]);

      // event1 no fue enviado previamente, event2 tampoco
      sentReminderRepo.findOne.mockResolvedValue(null);

      // event1 falla en resolveGroupId (módulo no encontrado), event2 también
      academicModuleRepo.findOne
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(null);

      // No debe lanzar — Promise.allSettled absorbe los errores
      await expect(service.handleReminder()).resolves.not.toThrow();
    });

    it('no llama a resolveGroupId si el evento ya fue enviado', async () => {
      const event = buildCalendarEvent();
      calendarService.getUpcomingMeetEvents.mockResolvedValue([event]);
      sentReminderRepo.findOne.mockResolvedValue({ id: 'reminder-001' }); // ya existe

      await service.handleReminder();

      expect(academicModuleRepo.findOne).not.toHaveBeenCalled();
    });

    it('no llama a sendReminder si resolveGroupId retorna null', async () => {
      const event = buildCalendarEvent({ title: 'Sin formato' });
      calendarService.getUpcomingMeetEvents.mockResolvedValue([event]);
      sentReminderRepo.findOne.mockResolvedValue(null);

      await service.handleReminder();

      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('flujo completo: consulta, match, envío y persistencia', async () => {
      const event = buildCalendarEvent();
      const academicMod = buildAcademicModule();

      calendarService.getUpcomingMeetEvents.mockResolvedValue([event]);
      sentReminderRepo.findOne.mockResolvedValue(null);
      academicModuleRepo.findOne.mockResolvedValue(academicMod);
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await service.handleReminder();

      expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
      expect(sentReminderRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ─── wasReminderSent() ────────────────────────────────────────────────────

  describe('wasReminderSent()', () => {
    it('retorna false cuando no existe registro en sent_reminders', async () => {
      sentReminderRepo.findOne.mockResolvedValue(null);

      const result = await (service as any).wasReminderSent('google-evt-001');

      expect(result).toBe(false);
    });

    it('retorna true cuando ya existe registro en sent_reminders', async () => {
      sentReminderRepo.findOne.mockResolvedValue({ id: 'reminder-001', googleEventId: 'google-evt-001' });

      const result = await (service as any).wasReminderSent('google-evt-001');

      expect(result).toBe(true);
    });

    it('busca por googleEventId en el repositorio', async () => {
      sentReminderRepo.findOne.mockResolvedValue(null);

      await (service as any).wasReminderSent('evt-target');

      expect(sentReminderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { googleEventId: 'evt-target' } }),
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

    it('caso feliz: llama a sendMessage() y guarda en sent_reminders', async () => {
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await (service as any).sendReminder(event, groupId);

      expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
      expect(sentReminderRepo.save).toHaveBeenCalledTimes(1);
    });

    it('pasa el groupId a sendMessage()', async () => {
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await (service as any).sendReminder(event, groupId);

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        groupId,
        expect.any(String),
      );
    });

    it('persiste el googleEventId en sent_reminders al enviar correctamente', async () => {
      whatsappService.sendMessage.mockResolvedValue(true);
      sentReminderRepo.save.mockResolvedValue({});

      await (service as any).sendReminder(event, groupId);

      expect(sentReminderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ googleEventId: event.id }),
      );
    });

    it('no guarda en sent_reminders si sendMessage() retorna false', async () => {
      whatsappService.sendMessage.mockResolvedValue(false);

      await (service as any).sendReminder(event, groupId);

      expect(sentReminderRepo.save).not.toHaveBeenCalled();
    });

    it('loggea error si sendMessage() retorna false', async () => {
      whatsappService.sendMessage.mockResolvedValue(false);

      await (service as any).sendReminder(event, groupId);

      expect(console.error).toHaveBeenCalled();
    });
  });

  // ─── buildMessage() ───────────────────────────────────────────────────────

  describe('buildMessage()', () => {
    it('el mensaje contiene el título del evento', () => {
      const event = buildCalendarEvent({ title: 'MOD-FINANZAS Introducción' });

      const message = (service as any).buildMessage(event);

      expect(message).toContain('MOD-FINANZAS Introducción');
    });

    it('el mensaje contiene el meetLink', () => {
      const event = buildCalendarEvent({ meetLink: 'https://meet.google.com/abc-xyz' });

      const message = (service as any).buildMessage(event);

      expect(message).toContain('https://meet.google.com/abc-xyz');
    });

    it('el mensaje contiene la hora formateada del evento', () => {
      const event = buildCalendarEvent({ startTime: new Date('2025-09-01T10:00:00') });

      const message = (service as any).buildMessage(event);

      // Verificar que contiene alguna representación de la hora (HH:MM)
      expect(message).toMatch(/\d{1,2}:\d{2}/);
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

    it('retorna exactamente max*60000 cuando Math.random() = 1', () => {
      jest.spyOn(Math, 'random').mockReturnValue(1);

      const result = (service as any).randomDelay(1, 3);

      expect(result).toBe(3 * 60_000);
    });
  });
});