import { classifyQuestion } from './classifier.js';
import { answerQuestion } from './answerEngine.js';
import type { SurveyProfile, SurveySession } from './types.js';

const profile: SurveyProfile = {
  facts: {},
  preferences: {},
  tone: 'neutral'
};

const session: SurveySession = {
  id: crypto.randomUUID(),
  answers: {},
  defaults: {}
};

const question = classifyQuestion({
  id: 'demo-1',
  text: "What's your favorite sport?",
  options: ['Basketball', 'Football', 'Soccer', 'Baseball']
});

console.log(answerQuestion(question, profile, session));
