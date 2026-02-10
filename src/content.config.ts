import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const photos = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/photos' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      photos: z.array(image()).min(1),
      manufacturer: z.string(),
      year: z.number(),
      scale: z.string(),
      game: z.string().optional(),
      faction: z.string().optional(),
    }),
});

export const collections = { photos };
