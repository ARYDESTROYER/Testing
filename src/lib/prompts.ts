/**
 * The eight attribute dimensions and their prompt pools.
 *
 * Supplied by Ruchira (study author). One prompt is drawn at random from a
 * dimension's pool per round, so no two participants get the same sequence.
 *
 * `hint` is the parenthetical shown under the prompt on the canvas; it only
 * exists for dimensions where the study copy provided one.
 */

export type DimensionId =
  | 'physical'
  | 'physiological'
  | 'perceptual'
  | 'cognitive'
  | 'personality'
  | 'emotional'
  | 'ethics'
  | 'behaviour'

export interface Dimension {
  id: DimensionId
  /** Display name used in the exported data and the researcher dashboard. */
  label: string
  /** Pool of prompts. One is drawn per round. */
  prompts: string[]
  /** Optional second line rendered under the prompt, matching the Figma comp. */
  hint?: string
}

export const DIMENSIONS: Dimension[] = [
  {
    id: 'physical',
    label: 'Physical',
    hint: '(ex, your hair, face, body)',
    prompts: [
      'enter your physical attributes',
      'how would a stranger describe your appearance in one glance?',
      'if someone had to sketch you from memory, what would they get right first?',
      "what's the first physical thing people notice about you?",
    ],
  },
  {
    id: 'physiological',
    label: 'Physiological',
    hint: '(ex, how fast you run, your stamina, your posture)',
    prompts: [
      'what does your body feel like on a normal day?',
      'enter what your body can do',
      "what's something your body struggles with?",
      'what physical limitation do you feel you have?',
    ],
  },
  {
    id: 'perceptual',
    label: 'Perceptual',
    prompts: [
      'what do you notice about the world before other people?',
      'what sense do you rely on most in your life?',
      "what's impossible for you to ignore in a new place?",
      'what do you pick up on in a conversation that others might miss?',
    ],
  },
  {
    id: 'cognitive',
    label: 'Cognitive',
    prompts: [
      'how does your mind work?',
      "how do you explain something you understand well to someone who doesn't?",
      'how do you figure something out?',
      'how do you make decisions?',
    ],
  },
  {
    id: 'personality',
    label: 'Personality',
    prompts: [
      'how would your friends describe you?',
      "what are some personality traits you'd never want to lose?",
      "what's a version of you that you show to people?",
      "what's something about you that surprises people once they know you well?",
    ],
  },
  {
    id: 'emotional',
    label: 'Emotional state',
    prompts: [
      'think of the last time you cried — what was the feeling?',
      'what brings out your most joyful side?',
      'what calms you?',
      'what do you do when someone else is upset around you?',
    ],
  },
  {
    id: 'ethics',
    label: 'Ethics',
    prompts: [
      'what principles do you like following?',
      'what is your moral compass like?',
      'if there were no laws, what crime would you commit?',
      'when is it okay to lie?',
    ],
  },
  {
    id: 'behaviour',
    label: 'Behaviour',
    prompts: [
      'what do you actually do under stress or pressure?',
      'how do you respond in heated debates?',
      "what are habits you have that don't match how you see yourself?",
      'what do you do when you feel angry or helpless?',
    ],
  },
]

export const DIMENSION_BY_ID = Object.fromEntries(
  DIMENSIONS.map((d) => [d.id, d]),
) as Record<DimensionId, Dimension>
