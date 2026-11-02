import type { FormFieldType, FillBy } from '@/lib/types'

// Labels + helpers for the forms engine (pure, no DB).

export const FIELD_TYPES: FormFieldType[] = ['short_text', 'long_text', 'select', 'checkboxes', 'date', 'number', 'link', 'section']

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  short_text: 'Short text',
  long_text: 'Paragraph',
  select: 'Dropdown',
  checkboxes: 'Checkboxes',
  date: 'Date',
  number: 'Number',
  link: 'Link',
  section: 'Section heading',
}

export const FILL_BY_LABELS: Record<FillBy, string> = {
  employee: 'The employee (self)',
  manager: 'A supervisor or admin',
  both: 'Either the employee or a supervisor/admin',
}

// A field type that holds an answer (vs 'section', which is just a heading).
export function fieldHasAnswer(type: FormFieldType): boolean {
  return type !== 'section'
}

export function hasOptions(type: FormFieldType): boolean {
  return type === 'select' || type === 'checkboxes'
}

export function newFieldId(): string {
  return 'f' + Math.random().toString(36).slice(2, 9)
}
