import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const photos = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/photos' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      photo: image(),
      category: z.string(),
      faction: z.string().optional(),
      manufacturer: z.string().optional(),
      tags: z.array(z.string()).default([]),
    }),
});

export const collections = { photos };
