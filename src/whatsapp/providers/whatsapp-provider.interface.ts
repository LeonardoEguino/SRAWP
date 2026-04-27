export interface WhatsappProvider {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendMessage(groupId: string, text: string): Promise<boolean>;
    isConnected(): boolean
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');