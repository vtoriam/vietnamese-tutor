# Vietnamese Tutor

Vietnamese Tutor is a web app where a learner records a Vietnamese word and gets short English pronunciation feedback. The backend uses PhoWhisper for transcription and an LLM for analysis. It is part of a university study on LLMs as Vietnamese tutors.

## Current scope

- Scripted words for current testing; Northern dialect only.
- Phonetics only: tones, initial consonants, and final consonants.
- English feedback; no numeric score.
- Deferred: pitch contour chart, recorded model audio, free speech mode, data logging, and ethics/consent text.

## Repository layout

```text
contract/  OpenAPI source of truth
frontend/  React, Vite, TypeScript app and mock API
backend/   Backend project
docs/      Design documentation
```

## Ownership

| Area     | Owner |
| -------- | ----- |
| Frontend | TODO  |
| Backend  | TODO  |
| Contract | TODO  |

## Quick start

```powershell
Set-Location frontend
npm install
$env:VITE_USE_MOCKS="true"; npm run dev
```

See [frontend/README.md](./frontend/README.md) for detailed setup and [contract/openapi.yaml](./contract/openapi.yaml) for the API.

## Team workflow

Keep `main` working. Use short feature branches such as `feat/recorder`, then open a pull request into `main`. Any change to `contract/openapi.yaml` needs review from the other side of the frontend/backend boundary.

## Privacy

Never commit audio recordings, `.env` files, or model weights. Audio is not stored until ethics approval settles the data policy.

## Script bank

Each prompt has `id`, `vietnamese`, `english`, and `unit` fields. The `unit` can be `word`, `phrase`, or `sentence`; switching between units is a data change in `frontend/src/data/prompts.json`.

The current word bank starts with the six tones on one syllable: `ma` (ghost), `má` (cheek), `mà` (but), `mả` (tomb), `mã` (horse), and `mạ` (rice seedling). It also includes `phở` (pho noodle soup), `cơm` (cooked rice), `giá` (price), and `chào` (hello). A Vietnamese speaker must check the words and meanings before the study.

## Known limitations

Single-word clips may give poor or invented transcripts.
