// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const base = 'obsidian-aloud-tts';
// https://astro.build/config
export default defineConfig({
	site: 'https://adrianlyjak.github.io',
	base: base,
	integrations: [
		starlight({
			title: 'Aloud TTS',
			logo: {
				src: './public/favicon.svg',
			},
			customCss: [
				// Custom CSS for purple theme
				'./src/styles/custom.css',
			],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/adrianlyjak/obsidian-aloud-tts' }],
			sidebar: [
				'installation',
				'guides/example',
			],
		}),
	],
});
