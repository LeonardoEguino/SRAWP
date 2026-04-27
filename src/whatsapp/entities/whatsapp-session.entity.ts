import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity('whatsapp_session')
export class WhatsappSession {
    @PrimaryColumn()
    id: string;

    @Column({type: 'text'})
    data: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}