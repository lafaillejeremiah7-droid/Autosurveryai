import type { SurveyAnswer, SurveyProfile, SurveyQuestion, SurveySession } from './types.js';

function normalizedKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pickStableOption(question: SurveyQuestion, session: SurveySession): string {
  const key = normalizedKey(question.text);
  const existing = session.defaults[key];
  if (typeof existing === 'string') return existing;

  const options = question.options ?? [];
  if (!options.length) return 'No preference';

  // Stable within a session instead of changing answers every time.
  const index = Math.abs([...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % options.length;
  const selected = options[index];
  session.defaults[key] = selected;
  return selected;
}

function findProfileValue(question: SurveyQuestion, profile: SurveyProfile) {
  const q = normalizedKey(question.text);

  for (const [key, value] of Object.entries(profile.facts)) {
    if (q.includes(normalizedKey(key))) return { value, source: 'profile_fact' as const };
  }
  for (const [key, value] of Object.entries(profile.preferences)) {
    if (q.includes(normalizedKey(key))) return { value, source: 'profile_preference' as const };
  }
  return null;
}

export function answerQuestion(
  question: SurveyQuestion,
  profile: SurveyProfile,
  session: SurveySession
): SurveyAnswer {
  const previous = session.answers[question.id];
  if (previous) return previous;

  const profileMatch = findProfileValue(question, profile);
  if (profileMatch) {
    const answer: SurveyAnswer = {
      questionId: question.id,
      value: profileMatch.value as string | string[] | number,
      source: profileMatch.source
    };
    session.answers[question.id] = answer;
    return answer;
  }

  if (question.type === 'factual') {
    throw new Error(`Missing factual profile value for: ${question.text}`);
  }

  let value: string | string[] | number;
  let source: SurveyAnswer['source'] = 'session_default';

  switch (question.type) {
    case 'single_select':
    case 'scale':
      value = pickStableOption(question, session);
      break;
    case 'multi_select': {
      const options = question.options ?? [];
      value = options.length ? [pickStableOption(question, session)] : [];
      break;
    }
    case 'ranking':
      value = [...(question.options ?? [])];
      break;
    case 'matrix':
      value = pickStableOption(question, session);
      break;
    case 'open_text':
    default:
      value = 'No strong preference. I am generally open to different options depending on the situation.';
      source = 'generated';
      break;
  }

  const answer: SurveyAnswer = { questionId: question.id, value, source };
  session.answers[question.id] = answer;
  return answer;
}
