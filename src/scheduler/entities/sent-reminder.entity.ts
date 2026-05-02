import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('sent_reminder')
export class SentReminder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    googleEventId: string;

    @CreateDateColumn()
    sentAt: Date;
}