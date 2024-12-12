export interface ValidationProblem {
    type: 'placeholder_mismatch' | 'linguistic_review' | 'grammar_issue';
    description: string;
}

export interface TranslationIssue {
    msgid: string;
    msgstr: string;
    problems: ValidationProblem[];
    suggestedFix: string;
}

export interface ValidatorConfig {
    provider: 'ollama' | 'anthropic' | 'openai';
    modelName?: string;
    apiKey?: string;
    baseUrl?: string;
}