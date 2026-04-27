// src/whatsapp/providers/baileys/baileys-auth.adapter.ts
import { Repository } from 'typeorm';
import { WhatsappSession } from '../../entities/whatsapp-session.entity';
import {
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';

export async function useDatabaseAuthState(repo: Repository<WhatsappSession>) {
  const write = async (id: string, data: object): Promise<void> => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await repo.upsert({ id, data: serialized }, ['id']);
  };

  const read = async (id: string): Promise<any> => {
    const record = await repo.findOne({ where: { id } });
    if (!record) return null;
    return JSON.parse(record.data, BufferJSON.reviver);
  };

  const remove = async (id: string): Promise<void> => {
    await repo.delete({ id }).catch(() => {});
  };

  const creds = (await read('creds')) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[],
        ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
          const result: { [id: string]: SignalDataTypeMap[T] } = {};

          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              result[id] = value as SignalDataTypeMap[T];
            }),
          );

          return result;
        },
        set: async (data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] } }): Promise<void> => {
          await Promise.all(
            Object.entries(data).flatMap(([type, ids]) =>
              Object.entries(ids as Record<string, unknown>).map(([id, value]) =>
                value ? write(`${type}-${id}`, value as object) : remove(`${type}-${id}`),
              ),
            ),
          );
        },
      },
    },
    saveCreds: () => write('creds', creds),
  };
}