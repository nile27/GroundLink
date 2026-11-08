-- 24시간 텔레메트리 시드 (5단계 성능 측정용)
-- 대상: SEED-001 (시뮬레이터가 돌리지 않는 위성). 실행 시점 기준 최근 24시간, 1초 간격 = 86,400행
-- 재실행: SEED-001 의 telemetry 행만 지우고 다시 넣는다 (다른 위성·다른 테이블은 건드리지 않음)
--
-- 값 모델 (시뮬레이터 SimpleOrbitModel 과 비슷한 주기)
--   궤도 주기 5400초(90분). 위상 p = (epoch 초 mod 5400) / 5400
--   sunlit : p < 0.65 (그늘 35%)
--   battery: 24시간 주기로 오르내리는 중심값(55 ± 32) + 궤도 안 삼각파(일조 충전, 그늘 방전, ±10) + 작은 잡음
--            → 하루 중 저점 부근 몇 시간은 20% 미만
--   temp   : 일조 구간 10~30°C, 그늘 구간 -10~-25°C 로 부드럽게
--   mode   : battery < 20 이면 SAFE (시뮬레이터 자동 SAFE 규칙과 같음), 아니면 NORMAL
--   rssi   : p 가 [0.20, 0.32) 인 교신 구간(12%)만 -110 ~ -85 dBm, 나머지 NULL

\set ON_ERROR_STOP on
\timing on

BEGIN;

INSERT INTO satellites (id, name)
VALUES ('SEED-001', '시드 (24시간 텔레메트리)')
ON CONFLICT (id) DO NOTHING;

-- 삭제 범위: SEED-001 의 텔레메트리 전부 (이 스크립트가 넣은 행뿐)
DELETE FROM telemetry WHERE sat_id = 'SEED-001';

INSERT INTO telemetry (sat_id, ts, battery, temp, rssi, mode, sunlit, received_at)
SELECT
  'SEED-001',
  g.ts,
  g.battery,
  round(g.temp::numeric, 2)::real,
  CASE WHEN g.p >= 0.20 AND g.p < 0.32
       THEN round((-110 + 25 * sin(pi() * (g.p - 0.20) / 0.12) + (random() - 0.5) * 3)::numeric, 1)::real
  END,
  CASE WHEN g.battery < 20 THEN 'SAFE' ELSE 'NORMAL' END,  -- 저장값(반올림 후) 기준
  g.p < 0.65,
  g.ts + interval '5 milliseconds'
FROM (
  SELECT
    s.ts,
    s.p,
    -- 중심값(24시간 주기) + 궤도 삼각파(일조 0→1 상승, 그늘 1→0 하강) + 잡음, 0~100 으로 제한, 소수 2자리
    round(least(100, greatest(0,
      55 + 32 * sin(2 * pi() * s.sec / 86400)
      + 10 * (CASE WHEN s.p < 0.65 THEN s.p / 0.65 ELSE 1 - (s.p - 0.65) / 0.35 END * 2 - 1)
      + (random() - 0.5) * 0.6
    ))::numeric, 2)::real AS battery,
    CASE WHEN s.p < 0.65
         THEN 10 + 20 * sin(pi() * s.p / 0.65)
         ELSE -10 - 15 * sin(pi() * (s.p - 0.65) / 0.35)
    END + (random() - 0.5) * 0.4 AS temp
  FROM (
    SELECT ts,
           extract(epoch FROM ts)::bigint AS sec,
           (extract(epoch FROM ts)::bigint % 5400) / 5400.0 AS p
    FROM generate_series(
      date_trunc('second', now()) - interval '24 hours' + interval '1 second',
      date_trunc('second', now()),
      interval '1 second'
    ) AS ts
  ) s
) g;

COMMIT;

\timing off
SELECT count(*) AS rows,
       min(ts) AS first_ts,
       max(ts) AS last_ts,
       round(min(battery)::numeric, 1) AS min_battery,
       round(max(battery)::numeric, 1) AS max_battery,
       count(*) FILTER (WHERE battery < 20) AS below_20,
       count(*) FILTER (WHERE mode = 'SAFE') AS safe_rows,
       count(*) FILTER (WHERE rssi IS NOT NULL) AS contact_rows,
       count(*) FILTER (WHERE sunlit) AS sunlit_rows
FROM telemetry WHERE sat_id = 'SEED-001';
