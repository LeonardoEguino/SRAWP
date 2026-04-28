import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BaileysProvider } from './baileys.provider';
import { WhatsappSession } from '../../entities/whatsapp-session.entity';

// ── Mocks de Baileys ────────────────────────────────────────────────────────

const mockSock = {
  ev: {
    on: jest.fn(),
  },
  sendMessage: jest.fn().mockResolvedValue(undefined),
  end: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@whiskeysockets/baileys', () => ({
    __esModule: true,
    default: jest.fn(() => mockSock),
    fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3, 0] }),
    makeCacheableSignalKeyStore: jest.fn().mockReturnValue({}),
    DisconnectReason: { loggedOut: 401 },
}));

jest.mock('./baileys-auth.adapter', () => ({
  useDatabaseAuthState: jest.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: jest.fn(),
  }),
}));

jest.mock('qrcode-terminal', () => ({
  generate: jest.fn(),
}));

// ── Helper para simular eventos de conexión ─────────────────────────────────

const getConnectionHandler = () => {
  const call = (mockSock.ev.on as jest.Mock).mock.calls.find(
    ([event]) => event === 'connection.update',
  );
  return call?.[1] as (update: object) => Promise<void>;
};

// ── Tests ───────────────────────────────────────────────────────────────────

const mockRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  upsert: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
};

describe('BaileysProvider', () => {
  let provider: BaileysProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaileysProvider,
        {
          provide: getRepositoryToken(WhatsappSession),
          useValue: mockRepo,
        },
      ],
    }).compile();

    provider = module.get<BaileysProvider>(BaileysProvider);
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('debe inicializar el socket y registrar los listeners', async () => {
      await provider.connect();
      expect(mockSock.ev.on).toHaveBeenCalledWith('creds.update', expect.any(Function));
      expect(mockSock.ev.on).toHaveBeenCalledWith('connection.update', expect.any(Function));
    });

    it('debe marcar como conectado cuando connection es "open"', async () => {
      await provider.connect();
      const handler = getConnectionHandler();
      await handler({ connection: 'open' });
      expect(provider.isConnected()).toBe(true);
    });

    it('debe marcar como desconectado cuando connection es "close"', async () => {
      jest.useFakeTimers(); // evita que el setTimeout de reconexión dispare
      await provider.connect();
      const handler = getConnectionHandler();
      await handler({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 408 } } },
      });
      expect(provider.isConnected()).toBe(false);
      jest.useRealTimers();
    });

    it('debe limpiar la sesión en BD si el cierre es por loggedOut', async () => {
      jest.useFakeTimers();
      await provider.connect();
      const handler = getConnectionHandler();
      await handler({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } }, // loggedOut
      });
      expect(mockRepo.clear).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('disconnect', () => {
    it('debe llamar a sock.end y marcar como desconectado', async () => {
      await provider.connect();
      await provider.disconnect();
      expect(mockSock.end).toHaveBeenCalled();
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('debe retornar false si no está conectado', async () => {
      const result = await provider.sendMessage('120363XXXXXX', 'Hola');
      expect(result).toBe(false);
    });

    it('debe agregar @g.us si el groupId no lo tiene', async () => {
      await provider.connect();
      const handler = getConnectionHandler();
      await handler({ connection: 'open' });

      await provider.sendMessage('120363XXXXXX', 'Hola');

      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '120363XXXXXX@g.us',
        { text: 'Hola' },
      );
    });

    it('debe retornar true al enviar exitosamente', async () => {
      await provider.connect();
      const handler = getConnectionHandler();
      await handler({ connection: 'open' });

      const result = await provider.sendMessage('120363XXXXXX@g.us', 'Hola');
      expect(result).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('debe retornar connected: false antes de conectar', () => {
      expect(provider.isConnected()).toEqual(false);
    });
  });
});