import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const miniatures = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/miniatures' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      photos: z.array(image()).min(1),
      manufacturer: z.string(),
      date: z.coerce.date(),
      scale: z.string(),
      game: z.string().optional(),
      faction: z.string().optional(),
      order: z.number().int().optional(),
    }),
});

export const collections = { miniatures };
