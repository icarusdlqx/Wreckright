import { z } from 'zod';

const Colour = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Cosmetic identity stays with the template when a crew member is saved or hired. */
export const PilotAppearanceSchema = z.strictObject({
  skin: Colour, hair: Colour, jacket: Colour, accent: Colour,
  style: z.enum(['crop', 'sweep', 'braid', 'shaved', 'curls', 'bob', 'bun', 'locs', 'quiff', 'undercut', 'bald', 'high_top']),
  face: z.enum(['angular', 'broad', 'oval', 'long', 'square', 'round', 'heart']),
  detail: z.enum(['scar', 'visor', 'earpiece', 'freckles', 'beard', 'none']),
  expression: z.enum(['calm', 'stern', 'grin', 'curious', 'wry', 'resolute']).default('calm'),
  kit: z.enum(['workcoat', 'flight_vest', 'officer', 'scarf', 'harness']).default('workcoat'),
  accessory: z.enum(['none', 'headset', 'goggles', 'glasses', 'cap', 'bandana']).default('none'),
  age: z.enum(['young', 'mature', 'veteran']).default('mature'),
});

export type PilotAppearance = z.infer<typeof PilotAppearanceSchema>;
