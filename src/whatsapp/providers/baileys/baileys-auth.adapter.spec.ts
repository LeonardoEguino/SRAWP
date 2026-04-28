import { Repository } from 'typeorm';
import { WhatsappSession } from '../../entities/whatsapp-session.entity';
import { useDatabaseAuthState } from './baileys-auth.adapter';
import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';

// Mock de Baileys para no depender de la librería en pruebas
jest.mock('@whiskeysockets/baileys', () => ({
  BufferJSON: {
    replacer: jest.fn((_, v) => v),
    reviver: jest.fn((_, v) => v),
  },
  initAuthCreds: jest.fn().mockReturnValue({ registered: false, me: null }),
  proto: {
    Message: {
      AppStateSyncKeyData: {
        fromObject: jest.fn((v) => v),
      },
    },
  },
}));

const mockRepo = (): jest.Mocked<Partial<Repository<WhatsappSession>>> => ({
  findOne: jest.fn(),
  upsert: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
});

describe('useDatabaseAuthState', () => {
  let repo: jest.Mocked<Partial<Repository<WhatsappSession>>>;

  beforeEach(() => {
    repo = mockRepo();
    jest.clearAllMocks();
  });

  describe('inicialización', () => {
    it('debe usar initAuthCreds si no hay creds en la BD', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const { state } = await useDatabaseAuthState(
        repo as Repository<WhatsappSession>,
      );

      expect(initAuthCreds).toHaveBeenCalled();
      expect(state.creds).toEqual({ registered: false, me: null });
    });

    it('debe cargar las creds existentes desde la BD', async () => {
      const storedCreds = { registered: true, me: { id: '123' } };
      (repo.findOne as jest.Mock).mockResolvedValue({
        id: 'creds',
        data: JSON.stringify(storedCreds),
      });

      const { state } = await useDatabaseAuthState(
        repo as Repository<WhatsappSession>,
      );

      expect(state.creds).toEqual(storedCreds);
      expect(initAuthCreds).not.toHaveBeenCalled();
    });
  });

  describe('saveCreds', () => {
    it('debe persistir las creds en la BD al llamar saveCreds', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const { saveCreds } = await useDatabaseAuthState(
        repo as Repository<WhatsappSession>,
      );

      await saveCreds();

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'creds' }),
        ['id'],
      );
    });
  });

  describe('keys.get', () => {
    it('debe retornar los valores almacenados por tipo e id', async () => {
      const stored = { someKey: 'someValue' };
      (repo.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // lectura de creds en init
        .mockResolvedValueOnce({ id: 'pre-key-1', data: JSON.stringify(stored) });

      const { state } = await useDatabaseAuthState(
        repo as Repository<WhatsappSession>,
      );

      const result = await state.keys.get('pre-key' as any, ['1']);
      expect(result['1']).toEqual(stored);
    });

    it('debe retornar null para claves inexistentes', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const { state } = await useDatabaseAuthState(
        repo as Repository<WhatsappSession>,
      );

      const result = await state.keys.get('pre-key' as any, ['999']);
      expect(result['999']).toBeNull();
    });
  });

  describe('keys.set', () => {
    it('debe persistir valores no nulos', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const { state } = await useDatabaseAuthState(
        repo as Repository<WhatsappSession>,
      );

      await state.keys.set({ 'pre-key': { '1': { key: 'value' } as any } });

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pre-key-1' }),
        ['id'],
      );
    });

    it('debe eliminar entradas con valor null/undefined', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const { state } = await useDatabaseAuthState(
        repo as Repository<WhatsappSession>,
      );

      await state.keys.set({ 'pre-key': { '1': null as any } });

      expect(repo.delete).toHaveBeenCalledWith({ id: 'pre-key-1' });
    });
  });
});