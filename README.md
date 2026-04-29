# Note Atelier

Notion 스타일의 개인 노트 워크스페이스입니다. Next.js App Router로 구성했고, Vercel 배포와 Supabase 인증/DB 연결을 기준으로 시작할 수 있게 잡았습니다.

## 실행

```bash
npm.cmd install
npm.cmd run dev
```

PowerShell 실행 정책 때문에 `npm`이 막히는 환경에서는 위처럼 `npm.cmd`를 쓰면 됩니다.

## Supabase 연결

1. Supabase 프로젝트를 만든 뒤 `supabase/schema.sql` 내용을 SQL Editor에서 실행합니다.
2. `.env.example`을 기준으로 `.env.local`을 만듭니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Supabase Auth의 URL 설정에 로컬 주소와 Vercel 배포 주소를 추가합니다.

환경변수가 없으면 앱은 브라우저 로컬 저장소로 동작합니다. 환경변수를 넣고 이메일 로그인하면 사용자별 Supabase 저장이 켜집니다.

## Vercel 배포

Vercel 프로젝트의 Environment Variables에 아래 값을 Development, Preview, Production 범위에 맞게 추가하세요.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

NeonDB는 별도 서버 액션/ORM이 필요해지는 시점에 붙이기 좋습니다. 현재 MVP는 인증, RLS, Postgres 테이블을 한 번에 쓰기 위해 Supabase를 기본 DB로 사용합니다.

## 현재 기능

- 페이지 생성, 삭제, 즐겨찾기
- 제목, 아이콘, 요약, 본문 블록 편집
- 본문, 제목, 체크리스트, 인용 블록
- 사이드바 검색
- 로컬 저장소 자동 저장
- Supabase 이메일 로그인 및 사용자별 노트 동기화
