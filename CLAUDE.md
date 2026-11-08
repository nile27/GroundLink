# GroundLink

가상 위성 지상국 시스템. 포트폴리오 프로젝트.
위성 시뮬레이터가 텔레메트리를 MQTT로 보내고, 수집 서버가 저장하며,
관제 앱(WPF)과 대시보드(React)가 서버 API로 데이터를 본다.

## 구조
- shared: simulator와 server가 공유하는 메시지 타입, 토픽 상수 (npm workspaces)
- simulator: 위성 시뮬레이터 (Node + TypeScript, mqtt.js)
- infra: Docker Compose (Mosquitto, PostgreSQL)
- server: NestJS 수집 서버. MQTT 구독 → DB 저장, REST API, 표준 WebSocket(@nestjs/platform-ws)
- dashboard: React 대시보드 (Vite react-ts 템플릿, npm workspace). 템플릿 tsconfig 사용(tsconfig.base.json 미사용), TypeScript 7.0.2 (다른 workspace는 6.0.3)
  - 실행: npm run dev:dashboard (http://localhost:5173) / 빌드: npm run build:dashboard
  - 루트 npm run build에는 포함되지 않음
- 추가 예정: monitor (C# WPF, 윈도우 전용)

## 데이터 흐름
```
simulator → Mosquitto → server → PostgreSQL
                          ↑ REST / WebSocket
                    monitor(WPF), dashboard(React)
```
클라이언트(WPF, React)는 DB나 브로커에 직접 접속하지 않고 server API로만 통신한다.

## MQTT 토픽
- sat/{id}/telemetry  주기적 상태값
- sat/{id}/event      교신 시작·종료, 모드 변경
- sat/{id}/alarm      임계값 초과
- sat/{id}/cmd        지상 → 위성 명령
- sat/{id}/cmd/ack    명령 처리 결과

## 원칙
- Docker 이미지는 latest 금지, 구체적 버전으로 고정
- npm 패키지는 설치된 정확한 버전으로 기록
- DB 접근은 TypeORM. DB 전용 문법은 최소화 (SQL Server로 전환 가능하게)
- API는 Swagger(OpenAPI)로 문서화. 클라이언트는 문서 기준으로만 통신
- 브로커·DB 포트는 127.0.0.1에만 바인딩. 외부 공개는 server API만
- 성능 개선 작업은 개선 전/후 수치를 docs/에 기록
- 설치, 삭제 등 시스템을 바꾸는 작업은 실행 전에 설명하고 승인받기
- 작업 전 남은 디스크 용량 확인, 5GB 미만이면 멈추고 보고

## 실행
- 인프라: cd infra && docker compose up -d
- 종료: cd infra && docker compose down (볼륨은 유지됨)

## Git 규칙
- 원격: https://github.com/nile27/GroundLink.git (기본 브랜치 main)
- 브랜치: 작업은 dev에서 하고, 단계가 끝나면 dev → main PR로 합친다 (PR에 단계 요약·전후 수치)
- Conventional Commits (feat:, fix:, perf:, refactor:, test:, docs:, chore:)
- 커밋은 작업 단위별로 분리
- perf: 커밋에는 개선 전/후 수치 포함
- 성능 개선 전 기준선 태그: v0.1-baseline
- 커밋 전 .env, node_modules, dist, 로그, DB 데이터 포함 여부 확인
- 새 도구·언어 추가 시 빌드 산출물, 캐시 폴더를 .gitignore에 먼저 반영
- 작업이 끝나면 docs/devlog.md에 기록

## 금지 사항
- git push 금지 (사용자가 직접 함)
- git push --force, git reset --hard, 이력 재작성 금지
- .env, 비밀번호, 토큰 커밋·하드코딩 금지
- docker compose down -v 등 볼륨 삭제 금지. 필요하면 이유 설명 후 승인
- sudo 금지. 필요하면 멈추고 안내
- 파일 영구 삭제 금지. 목록 보여주고 승인받기
- 요청받지 않은 범위의 코드 작성 금지
