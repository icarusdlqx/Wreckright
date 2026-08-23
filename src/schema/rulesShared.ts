import { z } from 'zod';

export const Factor = z.number().positive().max(4);
export const NameLike = z.string().min(1).max(60);
export const Probability = z.number().min(0).max(1);
