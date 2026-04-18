import { defineCollection, z } from 'astro:content';

const postsCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    section: z.string(),
    author: z.string(),
    image: z.string().optional(),
    imageCaption: z.string().optional(),
    imageSourceUrl: z.string().optional(),
    preview: z.string().optional(),
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = {
  posts: postsCollection,
};
