# Vietnamese Tutor frontend

## 1. Prerequisites

- Node.js 24.14.1, or another version matching the `>=22.12.0` engine range. Run `nvm use` if you use nvm.
- npm.

## 2. Install and run

From `frontend/`:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open the local URL printed by Vite. The `.env.example` file is currently empty; use the variables below when needed.

## 3. Environment variables

| Name | Example value | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL used by the API client. Defaults to this address when unset. |
| `VITE_USE_MOCKS` | `true` | Starts the MSW browser worker when exactly `true`. |
| `VITE_SURVEY_URL` | `https://example.test/survey` | Optional survey link shown on the completion screen. |

These are the only `VITE_*` variables used in `src/`.

## 4. Running with the mock server

Turn mocks on before starting Vite:

```powershell
$env:VITE_USE_MOCKS="true"
npm run dev
```

The MSW worker is served from `public/mockServiceWorker.js`. The default scenario is `success`. Add a query parameter to the Vite URL:

| Scenario | URL query | What it shows |
|---|---|---|
| `success` | `?mock=success` | Transcription, analysis, then results with a tone issue for `phở`. |
| `success_no_issues` | `?mock=success_no_issues` | Completed results with no pronunciation issues. |
| `slow` | `?mock=slow` | Analysis continues long enough for the app's timeout. |
| `no_speech` | `?mock=no_speech` | Failed attempt: no speech detected. |
| `too_short` | `?mock=too_short` | Failed attempt: audio too short. |
| `too_long` | `?mock=too_long` | Failed attempt: audio too long. |
| `transcription_failed` | `?mock=transcription_failed` | Failed attempt: transcription failed. |
| `analysis_failed` | `?mock=analysis_failed` | Failed attempt: analysis failed. |
| `upload_error` | `?mock=upload_error` | HTTP 500 while submitting the recording. |

## 5. Running against the real backend

Set the variables, then start Vite:

```powershell
$env:VITE_USE_MOCKS="false"
$env:VITE_API_BASE_URL="http://localhost:8000"
npm run dev
```

The expected default backend address from the contract is `http://localhost:8000`. The backend must allow CORS from the Vite development origin.

## 6. npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and create a production Vite build. |
| `npm run lint` | Run ESLint. |
| `npm run preview` | Preview the production build. |
| `npm run gen:api` | Generate `src/api/types.ts` from `../contract/openapi.yaml`. |

## 7. API contract and types

[`../contract/openapi.yaml`](../contract/openapi.yaml) is the source of truth. [`src/api/types.ts`](./src/api/types.ts) is generated and must not be edited by hand.

To change the contract:

1. Edit `../contract/openapi.yaml`.
2. Run `npm run gen:api`.
3. Fix TypeScript errors.
4. Update the MSW handlers.
5. Tell the backend teammate and ask them to review the change.

## 8. How the app works

The user flow is:

```text
Start -> Practice -> Results -> next phrase ... -> End
```

For each recording, the frontend:

1. Sends `POST /sessions` once when the learner begins.
2. Sends `POST /attempts` as multipart form data.
3. Polls `GET /attempts/{attempt_id}` every second.
4. Shows statuses: `uploading`, `transcribing`, `analysing`, `done`, or `failed`.
5. Stops on `done` or `failed`, or shows a timeout after 30 seconds.

## 9. Project structure

```text
src/
  api/          Typed client, generated types, and MSW handlers
  assets/       Static application assets
  components/   Start, practice, recorder, results, end, error, and UI components
  data/         Script bank
  hooks/        Recorder, attempt polling, and speech synthesis hooks
  lib/          Shared utilities
  App.tsx       Main flow and screen state
  main.tsx      App bootstrap and optional MSW startup
```

## 10. Editing the script bank

Edit [`src/data/prompts.json`](./src/data/prompts.json). Each item has:

- `id`: unique prompt ID.
- `vietnamese`: target phrase.
- `english`: English meaning.
- `unit`: `phrase` or `sentence`.

A Vietnamese speaker must check the text before the study.

## 11. Testing on a phone

Microphone access needs HTTPS except on `localhost`. Start the frontend, then run the Cloudflare quick tunnel from `frontend/`:

```powershell
npx cloudflared tunnel --url http://localhost:5173
```

Open the HTTPS URL printed by `cloudflared` on the phone. Vite allows `*.trycloudflare.com` hosts through `server.allowedHosts` in `vite.config.ts`.

## 12. Browser support and known limitations

- Chrome recordings normally use WebM/Opus; Safari uses MP4 when supported.
- Some devices have no Vietnamese speech-synthesis voice. The “Hear correct pronunciation” button is hidden then.
- Synthetic voice tones may be imperfect.
- Feedback is estimated from the transcript only, so speech recognition may “fix” mistakes.
- Very short clips may produce poor transcripts.

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| Microphone is blocked | Allow microphone access in browser settings, then retry. |
| CORS error | Configure the backend to allow the Vite development origin. |
| Blocked request. This host is not allowed | Use the `*.trycloudflare.com` URL printed by `cloudflared` and confirm `server.allowedHosts` includes `.trycloudflare.com` in `vite.config.ts`. |
| Mocks do not start because the worker is missing | Run `npx msw init public --save`, then restart Vite. |
| Types are out of date | Run `npm run gen:api` from `frontend/`. |
| No Vietnamese voice | Use a browser/device with a `vi` speech-synthesis voice; the button is intentionally hidden otherwise. |

## 14. Backend teammate notes

The backend must provide:

- `POST /sessions`, `POST /attempts`, and `GET /attempts/{attempt_id}`.
- Multipart fields: `session_id`, `prompt_id`, `target_text`, `unit`, `dialect`, `feedback_language`, and `audio`.
- Status values: `uploading`, `transcribing`, `analysing`, `done`, and `failed`.
- Contract error codes for no speech, length errors, transcription failure, analysis failure, and internal errors.
- No numeric score.
- `word_index` counted from `target_text.split()` starting at zero.
- Optional `acoustic` data; the current UI ignores it.

See [`../contract/openapi.yaml`](../contract/openapi.yaml) for the complete contract.
