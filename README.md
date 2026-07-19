# ORDR 데스크톱 조합도우미

Windows에서 로컬로 실행되는 Electron 앱입니다. 로그인·서버·동기화 없이 현재 세션에서만 동작합니다.

```powershell
npm install
npm start
```

배포용 포터블 실행 파일 생성:

```powershell
npm run dist
```

## 초기 데이터

ORDSearch 조합도우미 화면의 공개 데이터를 정규화해 SQLite로 보관하는 초기 작업물입니다.

```powershell
python tools/build_ord_db.py
```

생성 파일은 `data/ord_units.sqlite3`이며 현재 고유 ID가 있는 310개 유닛/재료를 담습니다. 핵심 테이블은 `units`, `rarities`, `skills`, `unit_skills`, `recipes`입니다. 이 데이터는 초기 기준 데이터이며 원본 사이트와 자동 동기화하지 않습니다.

현재 기능과 새 제품 방향은 `docs/product-plan.md`, 확정된 1차 범위는 `docs/v1-scope.md`에 정리했습니다.
