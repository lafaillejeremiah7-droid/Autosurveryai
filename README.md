# AutoSurveyAI

Minimal survey-answering copilot architecture.

## What v1 does

- Classifies common survey question types.
- Uses stored profile facts when a question asks for factual personal information.
- Uses stored preferences when available.
- Uses stable session defaults for low-stakes preference questions when no preference is defined.
- Remembers answers during a survey session to reduce contradictions.
- Provides a simple answer engine that can later be connected to an LLM for more natural open-ended responses.

## What v1 intentionally does not do

- It does not fabricate missing factual identity or eligibility information.
- It does not bypass attention checks or anti-bot systems.
- It does not automatically submit paid-survey forms.

## Structure

```text
src/
  index.ts          # minimal runner / coordinator
  classifier.ts     # identifies question type
  answerEngine.ts   # chooses an answer
  types.ts          # shared schemas
```

The system deliberately starts as one process instead of many agents. Additional workers should only be introduced if actual complexity requires them.

## Run

```bash
npm install
npm run dev
```

## Next useful steps

1. Add persistent profile storage.
2. Add an LLM adapter for natural open-ended answers.
3. Add multi-page session persistence.
4. Add tests for consistency and question classification.
