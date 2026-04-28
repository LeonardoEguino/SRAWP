import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { WHATSAPP_PROVIDER } from './providers/whatsapp-provider.interface';

const mockProvider = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn().mockResolvedValue(true),
  isConnected: jest.fn().mockReturnValue(true),
};

describe('WhatsappService', () => {
  let service: WhatsappService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: WHATSAPP_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('onModuleInit', () => {
    it('debe llamar a provider.connect() al inicializar', async () => {
      await service.onModuleInit();
      expect(mockProvider.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('debe llamar a provider.disconnect() al destruir', async () => {
      await service.onModuleDestroy();
      expect(mockProvider.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendMessage', () => {
    it('debe delegar el envío al proveedor y retornar true', async () => {
      const result = await service.sendMessage('120363XXXXXX@g.us', 'Hola');
      expect(mockProvider.sendMessage).toHaveBeenCalledWith('120363XXXXXX@g.us', 'Hola');
      expect(result).toBe(true);
    });

    it('debe retornar false si el proveedor falla', async () => {
      mockProvider.sendMessage.mockResolvedValueOnce(false);
      const result = await service.sendMessage('120363XXXXXX@g.us', 'Hola');
      expect(result).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('debe retornar el estado del proveedor', () => {
      const status = service.isConnected();
      expect(mockProvider.isConnected).toHaveBeenCalledTimes(1);
      expect(status).toEqual(true);
    });
  });
});