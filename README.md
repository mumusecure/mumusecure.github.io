# mumusecure.github.io

무무의 항해 기록 — 지구에서 시작해 우주 깊은 곳으로 나아가는 학습 포트폴리오.

## 컨셉

- **태양계 = 하나의 분야.** 첫 성계는 PQC(양자 내성 암호).
- **행성 = 큰 목표.** 지구(출발점) → 달 → 화성 → 목성 → 토성 → 천왕성 → 해왕성.
- **위성 = 세부 목표.** 실제 위성 이름을 쓴다 (포보스/데이모스, 이오/유로파/가니메데/칼리스토 …).
- **진행도 = 천체가 태양빛을 받는 면적.** 0%면 별빛을 가리는 검은 실루엣,
  50%면 명암경계선이 보이는 초승달, 100%면 실제 태양 각도에 따른 자연스러운 조명.
- 태양계를 다 돌면 **성간 공간**으로 나간다. 두 번째 분야부터는 다른 항성계에 놓이며,
  성계 각도는 황금각 137.5°씩 자동 배분되어 몇 개가 추가·삭제돼도 서로 겹치지 않는다.
- **최종 도착지는 없다.** 우주의 끝은 관측 경계 너머의 암흑이고, 공부할수록 관측 범위가 넓어진다.

## 구조

```
index.html              항해 화면
data/universe.json      유일한 데이터 소스 — 성계·천체·진행도
assets/js/catalog.js    실제 천체 제원(반지름 km, 거리 AU, 실제 위성 이름)
assets/js/app.js        3D 엔진 (three.js) — 셰이더, 배치, 워프, UI
assets/textures/        NASA / Solar System Scope 실사 텍스처 (2K)
```

좌표는 손으로 정하지 않는다. `catalog.js`의 실제 제원을 거듭제곱으로 압축해
`app.js`의 `layout()`이 자동 배치하고, 겹치면 최소 간격을 강제한다.

## 로컬 실행

```
python3 -m http.server 8901 --directory .
```

정적 파일만 쓰므로 빌드 단계가 없다. GitHub Pages는 저장소 루트를 그대로 서빙한다.

## 공개 원칙

화이트햇스쿨 내부 자료, 비공개 취약점, 타인의 개인정보는 절대 커밋하지 않는다.

## 텍스처 출처

- 지구 낮/밤: [NASA Visible Earth](https://visibleearth.nasa.gov/) — Public Domain
- 달·화성·목성·토성·천왕성·해왕성: [Solar System Scope](https://www.solarsystemscope.com/textures/) — CC BY 4.0
