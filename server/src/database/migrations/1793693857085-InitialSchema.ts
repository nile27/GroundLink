import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793693857085 implements MigrationInterface {
    name = 'InitialSchema1793693857085'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "satellites" (
                "id" character varying(32) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying(100),
                CONSTRAINT "PK_e2bf9f8a415cbd78e889efd40b0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "alarms" (
                "id" BIGSERIAL NOT NULL,
                "sat_id" character varying(32) NOT NULL,
                "ts" TIMESTAMP WITH TIME ZONE NOT NULL,
                "type" character varying(32) NOT NULL,
                "severity" character varying(16) NOT NULL,
                "value" real NOT NULL,
                "threshold" real NOT NULL,
                "message" character varying(255) NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_b776da486fb19d38b4f7777a6da" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_alarms_ts" ON "alarms" ("ts")
        `);
        await queryRunner.query(`
            CREATE TABLE "commands" (
                "id" character varying(36) NOT NULL,
                "sat_id" character varying(32) NOT NULL,
                "type" character varying(32) NOT NULL,
                "params" text NOT NULL,
                "status" character varying(16) NOT NULL DEFAULT 'PENDING',
                "result_message" character varying(255),
                "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "acked_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_7ac292c3aa19300482b2b190d1e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_commands_sat_requested" ON "commands" ("sat_id", "requested_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "events" (
                "id" BIGSERIAL NOT NULL,
                "sat_id" character varying(32) NOT NULL,
                "ts" TIMESTAMP WITH TIME ZONE NOT NULL,
                "type" character varying(32) NOT NULL,
                "detail" text,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_events_sat_ts" ON "events" ("sat_id", "ts")
        `);
        await queryRunner.query(`
            CREATE TABLE "telemetry" (
                "id" BIGSERIAL NOT NULL,
                "sat_id" character varying(32) NOT NULL,
                "ts" TIMESTAMP WITH TIME ZONE NOT NULL,
                "battery" real NOT NULL,
                "temp" real NOT NULL,
                "rssi" real,
                "mode" character varying(16) NOT NULL,
                "sunlit" boolean NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_9b2e5d3feb141269a262aa75fe8" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_telemetry_sat_ts" ON "telemetry" ("sat_id", "ts")
        `);
        await queryRunner.query(`
            ALTER TABLE "alarms"
            ADD CONSTRAINT "FK_8bc319d746d1072e8e06530699d" FOREIGN KEY ("sat_id") REFERENCES "satellites"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "commands"
            ADD CONSTRAINT "FK_a459cd0601178b61cd8a426a1ac" FOREIGN KEY ("sat_id") REFERENCES "satellites"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "events"
            ADD CONSTRAINT "FK_4db611212ef3d6851f83de6535c" FOREIGN KEY ("sat_id") REFERENCES "satellites"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "telemetry"
            ADD CONSTRAINT "FK_f73fcb3ea4ead588e96c9daf5cd" FOREIGN KEY ("sat_id") REFERENCES "satellites"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "telemetry" DROP CONSTRAINT "FK_f73fcb3ea4ead588e96c9daf5cd"
        `);
        await queryRunner.query(`
            ALTER TABLE "events" DROP CONSTRAINT "FK_4db611212ef3d6851f83de6535c"
        `);
        await queryRunner.query(`
            ALTER TABLE "commands" DROP CONSTRAINT "FK_a459cd0601178b61cd8a426a1ac"
        `);
        await queryRunner.query(`
            ALTER TABLE "alarms" DROP CONSTRAINT "FK_8bc319d746d1072e8e06530699d"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_telemetry_sat_ts"
        `);
        await queryRunner.query(`
            DROP TABLE "telemetry"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_events_sat_ts"
        `);
        await queryRunner.query(`
            DROP TABLE "events"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_commands_sat_requested"
        `);
        await queryRunner.query(`
            DROP TABLE "commands"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_alarms_ts"
        `);
        await queryRunner.query(`
            DROP TABLE "alarms"
        `);
        await queryRunner.query(`
            DROP TABLE "satellites"
        `);
    }

}
