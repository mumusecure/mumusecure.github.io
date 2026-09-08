// 실제 천체 데이터 — 반지름(km), 태양으로부터의 거리(AU), 실제 위성 이름
// 씬 배치용 값은 여기서 압축 변환한다. 사용자가 좌표를 직접 정할 일은 없다.
export const CATALOG = {
  earth:   { name: '지구',   en: 'Earth',   km: 6371,  au: 1.00,  tex: 'earth_day', night: 'earth_night_2k.jpg',   atmo: [0.24, 0.49, 1.00], moons: [] },
  moon:    { name: '달',     en: 'Moon',    km: 1737,  au: 1.03,  tex: 'moon',    atmo: null,               moons: [] },
  mars:    { name: '화성',   en: 'Mars',    km: 3390,  au: 1.52,  tex: 'mars',    atmo: [0.90, 0.52, 0.34], moons: ['포보스', '데이모스'] },
  jupiter: { name: '목성',   en: 'Jupiter', km: 69911, au: 5.20,  tex: 'jupiter', atmo: [0.95, 0.78, 0.55], moons: ['이오', '유로파', '가니메데', '칼리스토'] },
  saturn:  { name: '토성',   en: 'Saturn',  km: 58232, au: 9.58,  tex: 'saturn',  atmo: [0.96, 0.86, 0.62], moons: ['타이탄', '엔셀라두스', '레아', '이아페투스'], ring: [1.35, 2.30] },
  uranus:  { name: '천왕성', en: 'Uranus',  km: 25362, au: 19.19, tex: 'uranus',  atmo: [0.55, 0.90, 0.95], moons: ['티타니아', '오베론', '아리엘', '미란다'] },
  neptune: { name: '해왕성', en: 'Neptune', km: 24622, au: 30.07, tex: 'neptune', atmo: [0.35, 0.52, 0.98], moons: ['트리톤', '네레이드', '프로테우스'] }
};

// 실제 비율은 너무 극단적이라(해왕성은 지구의 30배 거리, 목성은 11배 크기)
// 거듭제곱으로 압축한다. 순서와 상대적 크기 관계는 실제 그대로 유지된다.
export const sceneRadius   = km => 1.55 * Math.pow(km / 6371, 0.42);
export const sceneDistance = au => 30 * Math.pow(au, 0.62);
