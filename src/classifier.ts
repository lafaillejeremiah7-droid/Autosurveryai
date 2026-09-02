import type { QuestionType, SurveyQuestion } from './types.js';

const factualPatterns = [
  /\bhow old\b/i,
  /\bage\b/i,
  /\bdate of birth\b/i,
  /\bemploy(ed|ment)\b/i,
  /\bincome\b/i,
  /\bzip code\b/i,
  /\bpostal code\b/i,
  /\bdo you currently\b/i,
  /\bhave you (ever|in the past|recently)\b/i
];

export function classifyQuestion(input: Omit<SurveyQuestion, 'type'> & { type?: QuestionType }): SurveyQuestion {
  if (input.type) return input as SurveyQuestion;
  const text = input.text.trim();
  let type: QuestionType = 'open_text';

  if (factualPatterns.some((pattern) => pattern.test(text))) type = 'factual';
  else if (input.options?.length) {
    if (/rank|order/i.test(text)) type = 'ranking';
    else if (/select all|choose all|check all/i.test(text)) type = 'multi_select';
    else if (/strongly agree|strongly disagree|1\s*[-–]\s*[57]/i.test(text)) type = 'scale';
    else type = 'single_select';
  }

  return { ...input, type } as SurveyQuestion;
}
