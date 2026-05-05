import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

export enum ReminderType {
    MORNING = 'MORNING',
    INMEDIATE = 'INMEDIATE',
}

@Entity('sent_reminder')
@Unique(['googleEventId', 'reminderType'])
export class SentReminder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    googleEventId: string;

    @Column({ type: 'enum', enum: ReminderType })
    reminderType: ReminderType;

    @CreateDateColumn()
    sentAt: Date;
}