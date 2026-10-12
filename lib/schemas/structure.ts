export const CATEGORIES = ['ugc', 'skill'] as const;
export const COMPONENTS = ['theory', 'practice', 'project'] as const;
export const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyse', 'evaluate', 'create'] as const;
export const ASSESSMENT_MODES = [
  'quiz',
  'written_test',
  'assignment',
  'learning_record',
  'lab_record',
  'coding_test',
  'lab_test',
  'coding_competition',
  'project_review',
] as const;
export const AGGREGATIONS = ['average', 'sum', 'best_n'] as const;
export const ROUNDING_MODES = ['half_up', 'ceil'] as const;
export const TERM_STATUSES = ['upcoming', 'current', 'closed'] as const;
export const OFFERING_STATUSES = ['draft', 'active', 'completed'] as const;
export const PROJECT_MODES = ['github', 'tracker'] as const;
