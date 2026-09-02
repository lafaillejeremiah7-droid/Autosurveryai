# AutoSurveyAI

AutoSurveyAI is a survey-answering copilot that interprets common survey question types and drafts responses that remain consistent with a user-provided profile.

## Intended use

This project assists a real respondent with drafting and consistency. It is not designed to fabricate eligibility, invent demographic or factual claims, bypass attention checks, create multiple identities, or automatically submit deceptive responses to paid surveys.

## Features

- Multiple choice / single select
- Likert and numeric scales
- Ranking questions
- Matrix questions
- Open-ended responses
- Multi-page survey session memory
- Tone controls: casual, professional, slightly humorous, neutral
- Profile-based consistency checks
- Contradiction detection
- Human-review workflow before submission

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the interactive API.

## API

`POST /answer` accepts a profile, tone, session ID, and question. The server remembers prior answers in the same session and returns a draft plus any consistency warnings.

## Example

```json
{
  "session_id": "demo-1",
  "profile": {
    "age": 25,
    "occupation": "software developer",
    "interests": ["technology", "fitness"]
  },
  "tone": "casual",
  "question": {
    "id": "q1",
    "type": "single_select",
    "text": "How often do you exercise?",
    "options": ["Never", "1-2 times/week", "3-4 times/week", "5+ times/week"]
  }
}
```
