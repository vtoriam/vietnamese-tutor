Vietnamese Pronunciation Tutor: Front End Design Summary

1. Purpose

A web interface where a learner records themselves saying a Vietnamese phrase or sentence, and receives short, constructive English feedback on their pronunciation. The backend (built separately) transcribes the audio with PhoWhisper and uses an LLM to analyse the result. This front end is the research instrument for the LLM-as-tutor study described in our literature review.

2. Scope and justification
   Decision Justification
   Scripted prompts only The app shows a target phrase, so the backend can compare the target with what was heard. Free speech has no target, which makes error detection unreliable. Section 5 of the review also calls for the same test data across experiments to keep comparisons fair. With under a month, free speech is listed as future work.
   Phrases and sentences Each script item has a unit field (phrase or sentence), so the backend can change later without a UI rewrite.
   Phonetics and intonation only Nguyen & Nguyen [7] identify this as the area learners find hardest. It also suits an audio-based tool better than grammar or writing.
   North dialect only Matches the study’s setting. We will note this as a limitation in the report.
   English feedback The learners are foreign speakers of Vietnamese. A feedback_language parameter keeps this changeable.
   No numeric score A match percentage from speech recognition does not measure pronunciation quality, and a number could mislead learners and our analysis. Feedback is a short summary plus word-level items.
   Model choice lives in the backend The review proposes comparing several LLMs. The UI does not need to know which one is used.
3. Pipeline and known limitation

Audio → pre-processing → PhoWhisper transcript → LLM feedback. PhoWhisper recognises words and does not assess pronunciation, and it may “correct” a mispronounced word. So v1 pronunciation feedback is an estimate from the transcript, and the UI labels it that way. Intonation is mostly out of reach until acoustic analysis is added (see Deferred).

4. Front end stack

React, TypeScript, Vite, Tailwind and shadcn/ui. Mobile-first, since learners are likely to use phones. Microphone access requires HTTPS outside of localhost. Everything runs on a single screen with no router.

5. User flow
   Start screen: what the app does, a quiet-room and headphones tip, a 2-second mic test with playback, and a placeholder for consent text (pending ethics). An anonymous session ID is created here.
   Prompt card: target text, English meaning, and a “Model voice (synthetic)” button using browser speech synthesis. The button is hidden if no Vietnamese voice exists on the device. Progress indicator, for example “3 of 10”.
   Recorder: tap to start and stop, auto-stop at 15 seconds, playback, then an explicit Send button. File upload is also supported.
   Results: target and transcript side by side, a short summary, and feedback items per word. Unlimited retries, with the latest attempt shown prominently and earlier ones collapsed.
   End screen: summary of each item with the number of tries, then “Practice again” or “Finish”. A survey link is a config value and can be empty.
6. API contract (to be written as an OpenAPI file)

The contract is asynchronous, since transcription plus LLM analysis takes seconds.

POST /sessions returns session_id.
POST /attempts takes audio and prompt_id, and returns attempt_id.
GET /attempts/{id} returns status (uploading, transcribing, analysing, done, failed), transcript and feedback.

Each feedback item carries word_index, expected, heard, category (tone, initial_consonant, final_consonant, other), explanation and tip. The backend does the word alignment, so the UI only renders by index. An optional acoustic object is reserved for later and is hidden when empty. The UI is built against a mock server (MSW) until the real backend is ready.

7. Error states

Microphone blocked, no speech detected, clip too short or too long, upload failure, backend failed status, and a 30-second timeout. Each gets a plain message and one clear action. The mock server can trigger every one, so these can be tested without a backend.

8. Deferred
   Pitch contour chart (learner vs native reference), planned for the next version alongside the acoustic pipeline (energy-based segmentation, pitch extraction, native reference data).
   Pre-recorded native model audio, replacing browser speech synthesis.
   Free speech mode.
   Data logging and storage. Audio is not retained until ethics is settled.
   Ethics approval and consent text.
   Linking surveys to attempts. Surveys happen only at the start and end of the research.
9. Risks to watch
   Browser Vietnamese voices vary by device and may pronounce tones imperfectly, so treat them as a stopgap.
   Transcript-based pronunciation feedback is limited, as noted in section 3.
   The timeline is under a month, so scope stays tight.
10. Suggested next steps
    Write the OpenAPI file.
    Create mock data for success, slow, and each error case.
    Scaffold the Vite app and build the screens in the order above.
