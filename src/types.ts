export type QuestionType =
  | 'single_select'
  | 'multi_select'
  | 'scale'
  | 'ranking'
  | 'open_text'
  | 'matrix'
  | 'factual';

export interface SurveyQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
}

export interface SurveyProfile {
  facts: Record<string, string | number | boolean>;
  preferences: Record<string, string | string[] | number>;
  tone?: 'casual' | 'professional' | 'neutral' | 'slightly_humorous';
}

export interface SurveyAnswer {
  questionId: string;
  value: string | string[] | number;
  source: 'profile_fact' | 'profile_preference' | 'session_default' | 'generated';
}

export interface SurveySession {
  id: string;
  answers: Record<string, SurveyAnswer>;
  defaults: Record<string, string | string[] | number>;
}
