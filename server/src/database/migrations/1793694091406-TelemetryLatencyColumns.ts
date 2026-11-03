import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * telemetry 지연 측정 컬럼.
 * - 기존 received_at(DEFAULT now())은 실제로는 DB 저장 시각이었으므로 inserted_at으로 이름만 바꿔 값을 보존한다
 * - 새 received_at: 서버가 MQTT 메시지를 받은 시각 (애플리케이션이 기록). 기존 행은 NULL
 *
 * 자동 생성(migration:generate)은 "inserted_at 추가 + received_at 기본값 제거"로 만들어
 * 기존 행의 저장 시각이 마이그레이션 시각으로 덮이므로, RENAME으로 직접 작성했다.
 * down은 새 received_at 값을 버린다.
 */
export class TelemetryLatencyColumns1793694091406 implements MigrationInterface {
  name = 'TelemetryLatencyColumns1793694091406';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "telemetry" RENAME COLUMN "received_at" TO "inserted_at"`);
    await queryRunner.query(`ALTER TABLE "telemetry" ADD "received_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "telemetry" DROP COLUMN "received_at"`);
    await queryRunner.query(`ALTER TABLE "telemetry" RENAME COLUMN "inserted_at" TO "received_at"`);
  }
}
