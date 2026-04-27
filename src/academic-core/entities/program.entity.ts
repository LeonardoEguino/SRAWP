import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { AcademicCoreModule } from "../academic-core.module";
import { AcademicModule } from "./academic-module.entity";

@Entity()
export class Program {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({unique: true})
    accountingCode: string;

    // @Column()
    // whatsappGroupId: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(
        () => AcademicModule, 
        (module) => module.program
    )
    modules: AcademicModule[];
}