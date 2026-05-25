import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1779498341972 implements MigrationInterface {
    name = 'InitialSchema1779498341972'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "whatsapp_session" ("id" character varying NOT NULL, "data" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ab3deca01898a2382e102758c3f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."sent_reminder_remindertype_enum" AS ENUM('MORNING', 'INMEDIATE')`);
        await queryRunner.query(`CREATE TABLE "sent_reminder" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "googleEventId" character varying NOT NULL, "reminderType" "public"."sent_reminder_remindertype_enum" NOT NULL, "sentAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_565769936ccd77cc58f00ad5118" UNIQUE ("googleEventId"), CONSTRAINT "UQ_a1d76d17aa6c435cb15ef86b989" UNIQUE ("googleEventId", "reminderType"), CONSTRAINT "PK_11427e1b945b34f19f4dd3faf98" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "academic_module" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "calendarPrefix" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "programId" uuid, CONSTRAINT "UQ_b9e7a285423299d168b7f4819ba" UNIQUE ("calendarPrefix"), CONSTRAINT "PK_2804074ac93dd00ab4bfe3e1770" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "program" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "accountingCode" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5e2d1e1f19967e82ac9dcbbacec" UNIQUE ("accountingCode"), CONSTRAINT "PK_3bade5945afbafefdd26a3a29fb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "academic_module" ADD CONSTRAINT "FK_4dabdc2e713774b27141cf1b8ce" FOREIGN KEY ("programId") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "academic_module" DROP CONSTRAINT "FK_4dabdc2e713774b27141cf1b8ce"`);
        await queryRunner.query(`DROP TABLE "program"`);
        await queryRunner.query(`DROP TABLE "academic_module"`);
        await queryRunner.query(`DROP TABLE "sent_reminder"`);
        await queryRunner.query(`DROP TYPE "public"."sent_reminder_remindertype_enum"`);
        await queryRunner.query(`DROP TABLE "whatsapp_session"`);
    }

}
