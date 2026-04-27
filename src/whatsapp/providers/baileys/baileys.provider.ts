import { Logger } from "@nestjs/common";
import { WhatsappProvider } from "../whatsapp-provider.interface";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, WASocket } from "@whiskeysockets/baileys";
import { InjectRepository } from "@nestjs/typeorm";
import { WhatsappSession } from "../../entities/whatsapp-session.entity";
import { Repository } from "typeorm";
import { useDatabaseAuthState } from "./baileys-auth.adapter";
import { Boom } from '@hapi/boom'
import * as qrcode from 'qrcode-terminal'
import pino from "pino";

export class BaileysProvider implements WhatsappProvider {
    private readonly logger = new Logger(BaileysProvider.name);
    private sock: WASocket | null = null;
    private connected = false;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECTS = 5;

    constructor(
        @InjectRepository(WhatsappSession)
        private readonly sessionRepo: Repository<WhatsappSession>,
    ) {}

    async connect(): Promise<void> {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useDatabaseAuthState(this.sessionRepo);
        
        this.sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino()),
            },
            logger: pino(),
            browser: ['Academic Reminders', 'Chrome', '1.0.0'],
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                this.logger.warn('Escanea el QR para conectar WhatsApp:');
                qrcode.generate(qr, {small: true});
            }

            if (connection === 'open') {
                this.connected = true;
                this.reconnectAttempts = 0;
                this.logger.log('WhatsApp conectado');
            }

            if (connection === 'close') {
                this.connected = false;
                const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const shouldReconnect = code !== DisconnectReason.loggedOut;

                if (shouldReconnect && this.reconnectAttempts < this.MAX_RECONNECTS) {
                    this.reconnectAttempts++;
                    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
                    this.logger.warn(`...Reconectando en ${delay / 1000}s... (intento ${this.reconnectAttempts})`);
                    setTimeout(() => this.connect(), delay);
                } else if (code === DisconnectReason.loggedOut){
                    this.logger.error('Sesion cerrada. Limpiando crendenciales...');
                    await this.sessionRepo.clear();
                }
            }
        });
    }

    async disconnect(): Promise<void> {
        this.sock?.end(undefined);
        this.connected = false;
    }

    async sendMessage(groupId: string, text: string): Promise<boolean> {
        if (!this.connected || !this.sock){
            this.logger.error('No se puede enviar: WhatsApp no conectado.');
            return false;
        }

        const jid = `${groupId}@g.us`;
        await this.sock.sendMessage(jid, {text});
        this.logger.log(`Mensaje enviado a ${jid}`);
        return true;
    }

    isConnected(): boolean {
        return this.connected;
    }

}